import { readFile, writeFile } from "node:fs/promises";
import type { ViteDevServer } from "vite";
import { ensureSegmentIds, findLostFieldPaths, validateCueSheet } from "@cuesheet/schema";
import { readRequestBody, sendJson } from "../shared.js";
import type { CuesheetWatcher } from "../watch.js";

/** Registers GET/POST/PUT /api/cuesheet: reads, validates, and saves the on-disk cuesheet. */
export function registerCuesheetRoute(server: ViteDevServer, filePath: string, watcher: CuesheetWatcher): void {
  server.middlewares.use("/api/cuesheet", async (req, res) => {
    if (req.method === "GET") {
      try {
        const json = await readFile(filePath, "utf8");
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.end(json);
      } catch {
        res.statusCode = 404;
        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        res.end("No draft yet - run pnpm episode with a source folder to generate one automatically.");
      }
      return;
    }

    if (req.method === "POST" || req.method === "PUT") {
      let parsed: unknown;
      try {
        const body = await readRequestBody(req);
        parsed = JSON.parse(body);
      } catch {
        sendJson(res, 400, {
          ok: false,
          errors: ["(root): request body is not valid JSON"],
        });
        return;
      }

      const result = validateCueSheet(parsed);
      if (!result.ok) {
        sendJson(res, 400, { ok: false, errors: result.errors });
        return;
      }

      // A zod object silently strips undefined keys by default. If the server is still running
      // an old schema version and a request carrying a new field (e.g. crop) is saved as-is,
      // that field would already be missing from result.data and get permanently baked into
      // disk (silent data loss). Before saving, compare the key set of the original body against
      // the serialized result, and refuse to save if any path is missing — a loss means an old
      // schema, so requiring a server restart (schema refresh) is the right call.
      const lostPaths = findLostFieldPaths(parsed, result.data);
      if (lostPaths.length > 0) {
        sendJson(res, 400, {
          ok: false,
          errors: [
            `The save system needs an update - restart the server and try again (lost fields: ${lostPaths.join(", ")})`,
          ],
        });
        return;
      }

      // Stamp a stable id onto any segment that lacks one (new segments from the palette; the
      // seed cuesheet). Returned in the response so the client holds the ids too, keeping them
      // stable across subsequent saves.
      const stamped = ensureSegmentIds(result.data);
      const content = `${JSON.stringify(stamped, null, 2)}\n`;
      watcher.markOwnWrite(content);
      await writeFile(filePath, content, "utf8");
      sendJson(res, 200, { ok: true, data: stamped });
      return;
    }

    res.statusCode = 405;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end("Method not allowed");
  });
}
