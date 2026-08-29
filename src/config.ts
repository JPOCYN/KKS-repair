import { existsSync } from "node:fs";
import path from "node:path";
import { findPersistentPrivateDirectory } from "./persistent-storage.js";

export type ManualStorage = "local" | "supabase";

export interface AppConfig {
  port: number | string;
  production: boolean;
  publicDirectory: string;
  manualsDirectory: string;
  manualBundleFile: string;
  manualIndexFile: string;
  manualRemoteBaseUrl: string | undefined;
  manualRemoteToken: string | undefined;
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
  const requestedManualBundle = path.resolve(workingDirectory, environment.MANUAL_BUNDLE_PATH || "private-data/manuals.bundle");
  const requestedManualIndex = path.resolve(workingDirectory, environment.MANUAL_INDEX_PATH || "private-data/manuals-index.json");
  let manualBundleFile = requestedManualBundle;
  let manualIndexFile = requestedManualIndex;

  // Hostinger runs Node.js builds outside public_html while persistent files stay
  // beside the recovered database. Use that known data location when a relative
  // manual path points into the ephemeral build directory.
  if (!existsSync(requestedManualIndex)) {
    const configuredDataDirectory = environment.DATA_DIR
      ? path.resolve(workingDirectory, environment.DATA_DIR)
      : null;
    const dataSibling = configuredDataDirectory
      ? (path.basename(configuredDataDirectory).toLowerCase() === "recovered" ? path.dirname(configuredDataDirectory) : configuredDataDirectory)
      : null;
    const persistentDirectory = findPersistentPrivateDirectory(workingDirectory, environment.PUBLIC_ORIGIN) || dataSibling;
    const persistentIndex = persistentDirectory && path.join(persistentDirectory, path.basename(requestedManualIndex));
    if (persistentIndex && existsSync(persistentIndex)) {
      manualIndexFile = persistentIndex;
      manualBundleFile = path.join(path.dirname(persistentIndex), path.basename(requestedManualBundle));
    }
  }

  return {
    port: parsePort(environment.PORT),
    production: environment.NODE_ENV === "production",
    publicDirectory: path.resolve(workingDirectory, environment.PUBLIC_DIR || "public"),
    manualsDirectory: path.resolve(workingDirectory, environment.MANUALS_DIR || "manuals"),
    manualBundleFile,
    manualIndexFile,
    manualRemoteBaseUrl: environment.MANUAL_REMOTE_BASE_URL?.trim() || undefined,
    manualRemoteToken: environment.MANUAL_REMOTE_TOKEN?.trim() || undefined,
    manualStorage: parseManualStorage(environment.MANUAL_STORAGE),
    configuredOrigins: environment.PUBLIC_ORIGIN,
  };
}
