import path from "node:path";

export type ManualStorage = "local" | "supabase";

export interface AppConfig {
  port: number | string;
  production: boolean;
  publicDirectory: string;
  manualsDirectory: string;
  manualBundleFile: string;
  manualIndexFile: string;
  manualStorage: ManualStorage;
  configuredOrigins: string | undefined;
}

function parseManualStorage(value: string | undefined): ManualStorage {
  const storage = (value || "local").trim().toLowerCase();
  if (storage === "local" || storage === "supabase") return storage;
  throw new Error("MANUAL_STORAGE must be local or supabase");
}

function parsePort(value: string | undefined): number | string {
  if (!value) return 3000;
  return /^\d+$/.test(value) ? Number(value) : value;
}

export function loadAppConfig(
  environment: NodeJS.ProcessEnv = process.env,
  workingDirectory = process.cwd(),
): AppConfig {
  return {
    port: parsePort(environment.PORT),
    production: environment.NODE_ENV === "production",
    publicDirectory: path.resolve(workingDirectory, environment.PUBLIC_DIR || "public"),
    manualsDirectory: path.resolve(workingDirectory, environment.MANUALS_DIR || "manuals"),
    manualBundleFile: path.resolve(workingDirectory, environment.MANUAL_BUNDLE_PATH || "private-data/manuals.bundle"),
    manualIndexFile: path.resolve(workingDirectory, environment.MANUAL_INDEX_PATH || "private-data/manuals-index.json"),
    manualStorage: parseManualStorage(environment.MANUAL_STORAGE),
    configuredOrigins: environment.PUBLIC_ORIGIN,
  };
}
