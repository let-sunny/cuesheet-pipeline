import type { IncomingMessage, ServerResponse } from "node:http";

export type Handler = (req: IncomingMessage, res: ServerResponse) => void | Promise<void>;

/**
 * Minimal reimplementation of connect's `app.use(path, handler)` mount matching, just enough to
 * drive the route/media modules' middleware in tests against a real http.Server (so req/res are
 * real Node streams — no need to hand-fake POST body streaming, ranges, etc).
 *
 * Mount semantics mirror connect: a handler mounted at `path` fires only if the request url is
 * exactly `path` or starts with `path + "/"` / `path + "?"`; the matched prefix is then stripped
 * from req.url before the handler runs (so e.g. a handler mounted at "/api/bgm-files" sees
 * req.url === "/stream?path=..." for a request to "/api/bgm-files/stream?path=...").
 */
export function createMiniConnectServer() {
  const mounts: { path: string; handler: Handler }[] = [];

  function use(path: string, handler: Handler): void {
    mounts.push({ path, handler });
  }

  async function dispatch(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = req.url ?? "/";
    for (const { path, handler } of mounts) {
      if (path === "/") {
        await handler(req, res);
        return;
      }
      if (url === path || url.startsWith(`${path}/`) || url.startsWith(`${path}?`)) {
        const rest = url.slice(path.length);
        req.url = rest === "" ? "/" : rest.startsWith("/") || rest.startsWith("?") ? rest : `/${rest}`;
        await handler(req, res);
        return;
      }
    }
    res.statusCode = 404;
    res.end("not found");
  }

  return { use, dispatch };
}
