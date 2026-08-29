import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import initSqlJs from "sql.js";

const SQL = await initSqlJs();

type SqlValue = number | string | Uint8Array | null;
type BindParameters = SqlValue[] | Record<string, SqlValue> | null;

export interface RunResult {
  changes: number;
  lastInsertRowid: number;
}

function asSqlValue(value: unknown): SqlValue {
  if (value === undefined) return null;
  if (value === null || typeof value === "number" || typeof value === "string" || value instanceof Uint8Array) {
    return value;
  }
  if (typeof value === "boolean") return value ? 1 : 0;
  throw new TypeError(`Unsupported SQLite parameter type: ${typeof value}`);
}

function normalizeParameters(args: unknown[]): BindParameters {
  if (args.length === 0) return null;
  if (args.length === 1 && Array.isArray(args[0])) return args[0].map(asSqlValue);
  if (args.length === 1 && args[0] !== null && typeof args[0] === "object" && !(args[0] instanceof Uint8Array)) {
    const normalized: Record<string, SqlValue> = {};
    for (const [key, value] of Object.entries(args[0] as Record<string, unknown>)) {
      const parameterKey = /^[.@:$]/.test(key) ? key : `@${key}`;
      normalized[parameterKey] = asSqlValue(value);
    }
    return normalized;
  }
  return args.map(asSqlValue);
}

export class SqlJsStatement {
  constructor(
    private readonly owner: SqlJsDatabase,
    private readonly sql: string,
  ) {}

  run(...args: unknown[]): RunResult {
    const parameters = normalizeParameters(args);
    this.owner.raw.run(this.sql, parameters);
    const changes = this.owner.raw.getRowsModified();
    const lastInsertRowid = Number(this.owner.raw.exec("SELECT last_insert_rowid() AS id")[0]?.values[0]?.[0] ?? 0);
    this.owner.persistAfterWrite();
    return { changes, lastInsertRowid };
  }

  get(...args: unknown[]): Record<string, SqlValue> | undefined {
    const statement = this.owner.raw.prepare(this.sql);
    try {
      const parameters = normalizeParameters(args);
      if (parameters) statement.bind(parameters);
      return statement.step() ? statement.getAsObject() : undefined;
    } finally {
      statement.free();
    }
  }

  all(...args: unknown[]): Array<Record<string, SqlValue>> {
    const statement = this.owner.raw.prepare(this.sql);
    const rows: Array<Record<string, SqlValue>> = [];
    try {
      const parameters = normalizeParameters(args);
      if (parameters) statement.bind(parameters);
      while (statement.step()) rows.push(statement.getAsObject());
      return rows;
    } finally {
      statement.free();
    }
  }
}

export class SqlJsDatabase {
  raw: InstanceType<typeof SQL.Database>;
  readonly name: string;
  private transactionDepth = 0;
  private dirty = false;
  private closed = false;

  constructor(private readonly filename: string) {
    this.name = filename;
    mkdirSync(path.dirname(filename), { recursive: true });
    this.raw = new SQL.Database(existsSync(filename) ? readFileSync(filename) : undefined);
  }

  prepare(sql: string): SqlJsStatement {
    this.assertOpen();
    return new SqlJsStatement(this, sql);
  }

  exec(sql: string): this {
    this.assertOpen();
    this.raw.exec(sql);
    this.persistAfterWrite();
    return this;
  }

  pragma(source: string): unknown[] {
    this.assertOpen();
    if (/^journal_mode\s*=\s*wal$/i.test(source.trim())) return [];
    const results = this.raw.exec(`PRAGMA ${source}`);
    return results[0]?.values ?? [];
  }

  transaction<TArgs extends unknown[], TResult>(callback: (...args: TArgs) => TResult): (...args: TArgs) => TResult {
    return (...args: TArgs): TResult => {
      this.assertOpen();
      const outermost = this.transactionDepth === 0;
      const savepoint = `app_tx_${this.transactionDepth}`;
      this.raw.run(outermost ? "BEGIN" : `SAVEPOINT ${savepoint}`);
      this.transactionDepth += 1;
      try {
        const result = callback(...args);
        this.transactionDepth -= 1;
        this.raw.run(outermost ? "COMMIT" : `RELEASE SAVEPOINT ${savepoint}`);
        if (outermost && this.dirty) this.persist();
        return result;
      } catch (error) {
        this.transactionDepth -= 1;
        this.raw.run(outermost ? "ROLLBACK" : `ROLLBACK TO SAVEPOINT ${savepoint}`);
        if (!outermost) this.raw.run(`RELEASE SAVEPOINT ${savepoint}`);
        if (outermost) this.dirty = false;
        throw error;
      }
    };
  }

  persistAfterWrite(): void {
    this.dirty = true;
    if (this.transactionDepth === 0) this.persist();
  }

  close(): void {
    if (this.closed) return;
    if (this.dirty) this.persist();
    this.raw.close();
    this.closed = true;
  }

  replaceWithFile(sourceFile: string): void {
    this.assertOpen();
    const replacement = new SQL.Database(readFileSync(sourceFile));
    replacement.run("PRAGMA foreign_keys = ON");
    const previous = this.raw;
    this.raw = replacement;
    this.dirty = true;
    try {
      this.persist();
      previous.close();
    } catch (error) {
      this.raw.close();
      this.raw = previous;
      this.dirty = false;
      throw error;
    }
  }

  private persist(): void {
    const temporary = `${this.filename}.tmp`;
    writeFileSync(temporary, this.raw.export());
    renameSync(temporary, this.filename);
    this.dirty = false;
  }

  private assertOpen(): void {
    if (this.closed) throw new Error("Database is closed");
  }
}
