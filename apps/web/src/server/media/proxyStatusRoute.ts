import type { ViteDevServer } from "vite";
import { sendJson } from "../shared.js";
import { getProxyQueueState } from "./proxyGeneration.js";

/** Registers GET /api/proxy-status: the proxy generation queue's current state, for the edit screen's "generating proxies" notice. */
export function registerProxyStatusRoute(server: ViteDevServer): void {
  server.middlewares.use("/api/proxy-status", (req, res) => {
    if (req.method !== "GET") {
      res.statusCode = 405;
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.end("Method not allowed");
      return;
    }
    sendJson(res, 200, getProxyQueueState());
  });
}
