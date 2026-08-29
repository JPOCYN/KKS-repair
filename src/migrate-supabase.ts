import path from "node:path";
import { pathToFileURL } from "node:url";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createSupabaseServerClient,
  readSupabaseServerConfig,
  requireExpectedSupabaseProject,
} from "./supabase-client.js";
import {
  migrationCounts,
  readSupabaseMigrationDataset,
  type SupabaseMigrationDataset,
} from "./supabase-migration.js";
import type { Database } from "./supabase-types.js";

type MigratedTable = keyof SupabaseMigrationDataset;
type MigratedRow = SupabaseMigrationDataset[MigratedTable][number];

interface MigrationOptions {
  apply: boolean;
  allowExtraRows: boolean;
  batchSize: number;
  databaseFile: string;
}

function parsePositiveInteger(value: string | undefined, label: string): number {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1) throw new Error(`${label} must be a positive integer`);
  return number;
}

export function parseMigrationOptions(arguments_: string[]): MigrationOptions {
  let apply = false;
  let allowExtraRows = false;
  let batchSize = 500;
  let databaseFile = process.env.SQLITE_MIGRATION_PATH || path.join(process.env.DATA_DIR || "data", "kks-repair.db");
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index]!;
    const equalsIndex = argument.indexOf("=");
    const name = equalsIndex < 0 ? argument : argument.slice(0, equalsIndex);
    const inlineValue = equalsIndex < 0 ? undefined : argument.slice(equalsIndex + 1);
    if (name === "--apply" && inlineValue === undefined) apply = true;
    else if (name === "--allow-extra" && inlineValue === undefined) allowExtraRows = true;
    else if (name === "--database") databaseFile = inlineValue ?? arguments_[++index] ?? "";
    else if (name === "--batch-size") batchSize = parsePositiveInteger(inlineValue ?? arguments_[++index], "--batch-size");
    else throw new Error(`Unknown argument: ${argument}`);
  }
  if (!databaseFile) throw new Error("--database requires a path");
  if (batchSize > 1000) throw new Error("--batch-size cannot exceed 1000");
  return { apply, allowExtraRows, batchSize, databaseFile: path.resolve(databaseFile) };
}

function chunks<T>(rows: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < rows.length; index += size) result.push(rows.slice(index, index + size));
  return result;
}

async function readTargetCount(client: SupabaseClient<Database>, table: MigratedTable): Promise<number> {
  const { count, error } = await client.from(table).select("id", { count: "exact", head: true });
  if (error) throw new Error(`Cannot read target table ${table}: ${error.message}`);
  return count ?? 0;
}

async function readTargetIds(client: SupabaseClient<Database>, table: MigratedTable): Promise<number[]> {
  const ids: number[] = [];
  const pageSize = 1000;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await client
      .from(table)
      .select("id")
      .order("id")
      .range(offset, offset + pageSize - 1);
    if (error) throw new Error(`Cannot preflight target table ${table}: ${error.message}`);
    const page = (data || []) as unknown as Array<{ id: number | string }>;
    for (const row of page) {
      const id = Number(row.id);
      if (!Number.isSafeInteger(id)) throw new Error(`Target table ${table} contains an invalid id`);
      ids.push(id);
    }
    if (page.length < pageSize) break;
  }
  return ids;
}

async function assertTargetContainsNoUnrelatedRows(
  client: SupabaseClient<Database>,
  dataset: SupabaseMigrationDataset,
): Promise<void> {
  for (const table of Object.keys(dataset) as MigratedTable[]) {
    const sourceIds = new Set(dataset[table].map((row) => row.id));
    const targetIds = await readTargetIds(client, table);
    const unexpected = targetIds.filter((id) => !sourceIds.has(id));
    if (unexpected.length) {
      throw new Error(`Target table ${table} contains unrelated ids: ${unexpected.slice(0, 10).join(", ")}. Use --allow-extra only if this is intentional.`);
    }
  }
}

async function upsertTable(
  client: SupabaseClient<Database>,
  table: MigratedTable,
  rows: MigratedRow[],
  batchSize: number,
): Promise<void> {
  const batches = chunks(rows, batchSize);
  for (let index = 0; index < batches.length; index += 1) {
    const { error } = await client.from(table).upsert(batches[index] as never, { onConflict: "id" });
    if (error) throw new Error(`Import failed for ${table} batch ${index + 1}/${batches.length}: ${error.message}`);
  }
}

const dateFields = new Set(["created_at", "updated_at", "vip_expires_at", "expires_at"]);

function canonicalValue(key: string, value: unknown): unknown {
  if (value === undefined) return null;
  if (dateFields.has(key) && typeof value === "string") {
    const timestamp = Date.parse(value);
    return Number.isNaN(timestamp) ? value : new Date(timestamp).toISOString();
  }
  if (typeof value === "number" && Object.is(value, -0)) return 0;
  return value;
}

function canonicalRow(row: Record<string, unknown>): string {
  const normalized = Object.fromEntries(
    Object.keys(row).sort().map((key) => [key, canonicalValue(key, row[key])]),
  );
  return JSON.stringify(normalized);
}

async function verifyTable(
  client: SupabaseClient<Database>,
  table: MigratedTable,
  rows: MigratedRow[],
  batchSize: number,
  allowExtraRows: boolean,
): Promise<void> {
  const count = await readTargetCount(client, table);
  if ((!allowExtraRows && count !== rows.length) || count < rows.length) {
    throw new Error(`Target count mismatch for ${table}: source=${rows.length}, target=${count}`);
  }

  for (const batch of chunks(rows, batchSize)) {
    const ids = batch.map((row) => row.id);
    const { data, error } = await client.from(table).select("*").in("id", ids).order("id");
    if (error) throw new Error(`Verification query failed for ${table}: ${error.message}`);
    const remoteById = new Map((data || []).map((row) => [Number((row as { id: number }).id), row]));
    for (const source of batch) {
      const remote = remoteById.get(source.id);
      if (!remote) throw new Error(`Target row missing from ${table}: id=${source.id}`);
      if (canonicalRow(source as unknown as Record<string, unknown>) !== canonicalRow(remote as unknown as Record<string, unknown>)) {
        throw new Error(`Target row differs in ${table}: id=${source.id}`);
      }
    }
  }
}

async function migrate(options: MigrationOptions): Promise<void> {
  const dataset = readSupabaseMigrationDataset(options.databaseFile);
  const counts = migrationCounts(dataset);
  console.log(JSON.stringify({ mode: options.apply ? "apply" : "dry-run", source: options.databaseFile, counts, sessions: "excluded" }));
  if (!options.apply) {
    console.log("Dry run complete. Add --apply only after the Supabase migration has been applied and the target project ref is pinned.");
    return;
  }

  const config = readSupabaseServerConfig();
  const projectRef = requireExpectedSupabaseProject(config);
  const client = createSupabaseServerClient(config);
  const tables = Object.keys(dataset) as MigratedTable[];
  const before = Object.fromEntries(await Promise.all(tables.map(async (table) => [table, await readTargetCount(client, table)])));
  console.log(JSON.stringify({ projectRef, targetCountsBefore: before }));
  if (!options.allowExtraRows) {
    await assertTargetContainsNoUnrelatedRows(client, dataset);
    console.log(JSON.stringify({ projectRef, targetPreflight: "compatible" }));
  }

  for (const table of tables) {
    await upsertTable(client, table, dataset[table] as MigratedRow[], options.batchSize);
    console.log(JSON.stringify({ imported: table, rows: dataset[table].length }));
  }
  for (const table of tables) {
    await verifyTable(client, table, dataset[table] as MigratedRow[], options.batchSize, options.allowExtraRows);
    console.log(JSON.stringify({ verified: table, rows: dataset[table].length }));
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const options = parseMigrationOptions(process.argv.slice(2));
  migrate(options).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
