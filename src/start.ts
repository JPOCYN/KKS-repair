import { appendFileSync } from "node:fs";

function logStartupError(error: unknown): void {
  const message = error instanceof Error ? error.stack || error.message : String(error);
  console.error(message);
  const logFile = process.env.STARTUP_LOG_FILE;
  if (!logFile) return;
  try {
    appendFileSync(logFile, `${new Date().toISOString()} ${message}\n`);
  } catch (writeError) {
    console.error("Could not write startup error log", writeError);
  }
}

process.on("uncaughtException", (error) => {
  logStartupError(error);
  process.exit(1);
});
process.on("unhandledRejection", (error) => {
  logStartupError(error);
  process.exit(1);
});

import("./server.js").catch((error) => {
  logStartupError(error);
  process.exit(1);
});
