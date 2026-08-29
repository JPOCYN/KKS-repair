import express, { type RequestHandler } from "express";
import type { AppConfig } from "./config.js";
import { createManualBundleHandler, createRemoteManualBundleHandler } from "./manual-bundle.js";

export async function createManualStorageHandler(config: AppConfig): Promise<RequestHandler> {
  const router = express.Router();
  if (config.manualStorage === "local") {
    if (Boolean(config.manualRemoteBaseUrl) !== Boolean(config.manualRemoteToken)) {
      throw new Error("MANUAL_REMOTE_BASE_URL and MANUAL_REMOTE_TOKEN must be configured together");
    }
    if (config.manualRemoteBaseUrl && config.manualRemoteToken) {
      router.use(createRemoteManualBundleHandler(config.manualRemoteBaseUrl, config.manualRemoteToken));
    } else {
      router.use(
        express.static(config.manualsDirectory, {
          fallthrough: true,
          maxAge: config.production ? "1d" : 0,
        }),
        createManualBundleHandler(config.manualBundleFile, config.manualIndexFile),
      );
    }
  } else {
    const { createSupabaseManualHandler } = await import("./supabase-manuals.js");
    router.use(await createSupabaseManualHandler());
  }
  router.use((_req, res) => res.status(404).send("Manual file not found"));
  return router;
}
