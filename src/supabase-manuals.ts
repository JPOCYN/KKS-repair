import { Readable } from "node:stream";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import path from "node:path";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import { normalizeManualPath } from "./manual-bundle.js";
import {
  createSupabaseServerClient,
  readSupabaseServerConfig,
  requireExpectedSupabaseProject,
} from "./supabase-client.js";

const copiedHeaders = [
  "accept-ranges",
  "content-encoding",
  "content-length",
  "content-range",
  "content-type",
  "etag",
  "last-modified",
] as const;

function encodeObjectPath(value: string): string {
  return value.split("/").map((segment) => encodeURIComponent(segment)).join("/");
}

export function supabaseStorageObjectUrl(projectUrl: string, bucket: string, objectPath: string): string {
  const normalized = normalizeManualPath(objectPath);
  if (!normalized) throw new Error("Manual object path is invalid");
  if (!/^[a-z0-9][a-z0-9._-]{0,99}$/.test(bucket)) throw new Error("SUPABASE_MANUAL_BUCKET is invalid");
  return `${new URL(projectUrl).origin}/storage/v1/object/${encodeURIComponent(bucket)}/${encodeObjectPath(normalized)}`;
}

export async function createSupabaseManualHandler(
  environment: NodeJS.ProcessEnv = process.env,
  fetchImplementation: typeof fetch = fetch,
): Promise<RequestHandler> {
  const config = readSupabaseServerConfig(environment);
  requireExpectedSupabaseProject(config, environment);
  const bucket = environment.SUPABASE_MANUAL_BUCKET?.trim() || "manuals";
  if (!/^[a-z0-9][a-z0-9._-]{0,99}$/.test(bucket)) throw new Error("SUPABASE_MANUAL_BUCKET is invalid");
  const { data: buckets, error } = await createSupabaseServerClient(config).storage.listBuckets();
  if (error) throw new Error(`Cannot inspect Supabase manual bucket: ${error.message}`);
  const configuredBucket = buckets.find((candidate) => candidate.name === bucket);
  if (!configuredBucket) throw new Error(`Supabase manual bucket does not exist: ${bucket}`);
  if (configuredBucket.public) throw new Error(`Supabase manual bucket must be private: ${bucket}`);

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const objectPath = normalizeManualPath(req.path);
    if (!objectPath) return next();
    try {
      const headers = new Headers({
        apikey: config.secretKey,
        authorization: `Bearer ${config.secretKey}`,
      });
      const range = req.get("range");
      if (range) headers.set("range", range);
      const upstream = await fetchImplementation(supabaseStorageObjectUrl(config.url, bucket, objectPath), {
        method: req.method === "HEAD" ? "HEAD" : "GET",
        headers,
        redirect: "error",
      });
      if (upstream.status === 404) {
        await upstream.body?.cancel();
        return next();
      }
      if (!upstream.ok && upstream.status !== 206) {
        await upstream.body?.cancel();
        throw new Error(`Supabase Storage returned HTTP ${upstream.status}`);
      }
      res.status(upstream.status);
      for (const name of copiedHeaders) {
        const value = upstream.headers.get(name);
        if (value) res.setHeader(name, value);
      }
      if (!upstream.headers.has("content-type")) res.type(path.extname(objectPath));
      res.setHeader("Cache-Control", "private, max-age=86400");
      if (req.method === "HEAD" || !upstream.body) {
        await upstream.body?.cancel();
        res.end();
        return;
      }
      const stream = Readable.fromWeb(upstream.body as unknown as NodeReadableStream<Uint8Array>);
      stream.on("error", (error) => res.destroy(error));
      stream.pipe(res);
    } catch (error) {
      next(error);
    }
  };
}
