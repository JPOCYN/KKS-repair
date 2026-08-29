import express, { type RequestHandler } from "express";
import type { AppConfig } from "./config.js";
import { createManualBundleHandler } from "./manual-bundle.js";

export async function createManualStorageHandler(config: AppConfig): Promise<RequestHandler> {
  const router = express.Router();
  if (config.manualStorage === "local") {
    router.use(
      express.static(config.manualsDirectory, {
        fallthrough: true,
        maxAge: config.production ? "1d" : 0,
      }),
      createManualBundleHandler(config.manualBundleFile, config.manualIndexFile),
    );
  } else {
    const { createSupabaseManualHandler } = await import("./supabase-manuals.js");
    router.use(await createSupabaseManualHandler());
  }
  router.use((_req, res) => res.status(404).send("Manual file not found"));
  return router;
}
