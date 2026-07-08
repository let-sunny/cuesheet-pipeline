import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import type { ViteDevServer } from "vite";
import { createMiniConnectServer } from "./miniConnect.js";

export interface TestServerHandle {
  baseUrl: string;
  /** The fake ViteDevServer-shaped object passed to register(). */
  fakeServer: ViteDevServer;
  close(): Promise<void>;
}

/**
 * Spins up a real (loopback, ephemeral-port) http.Server wired to a mini connect-style dispatcher,
 * and calls `register(fakeServer)` so route/media modules can attach their middleware to it exactly
 * as they would to a real Vite dev server. Using a real http.Server means POST bodies, byte ranges,
 * Content-Disposition headers etc. all flow through real Node request/response objects rather than
 * hand-rolled fakes.
 */
export async function startTestServer(
  register: (fakeServer: ViteDevServer) => void,
): Promise<TestServerHandle> {
  const mini = createMiniConnectServer();
  const fakeServer = {
    middlewares: { use: mini.use },
    config: { logger: { info: () => {}, warn: () => {}, error: () => {} } },
    ws: { send: () => {} },
    httpServer: null,
  } as unknown as ViteDevServer;

  register(fakeServer);

  const httpServer: Server = createServer((req, res) => {
    void mini.dispatch(req, res);
  });
  await new Promise<void>((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
  const { port } = httpServer.address() as AddressInfo;

  return {
    baseUrl: `http://127.0.0.1:${port}`,
    fakeServer,
    close(): Promise<void> {
      return new Promise((resolve, reject) => {
        httpServer.close((err) => (err ? reject(err) : resolve()));
      });
    },
  };
}
