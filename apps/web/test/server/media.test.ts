import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { registerMediaMiddleware } from "../../src/server/media.js";
import { startTestServer, type TestServerHandle } from "../helpers/testServer.js";

describe("GET/HEAD /api/local-video", () => {
  let handle: TestServerHandle | null = null;

  afterEach(async () => {
    await handle?.close();
    handle = null;
  });

  async function start(): Promise<{ baseUrl: string; workDir: string }> {
    const workDir = mkdtempSync(join(tmpdir(), "cuesheet-web-media-"));
    // registerMediaMiddleware's background proxy-generation kickoff reads this as a cuesheet -
    // a nonexistent path is fine, it silently no-ops on failure (fire-and-forget).
    const cuesheetPath = join(workDir, "project.cuesheet.json");
    handle = await startTestServer((server) => {
      registerMediaMiddleware(server, cuesheetPath);
    });
    return { baseUrl: handle.baseUrl, workDir };
  }

  it("GET returns 200 with the file body for an existing file", async () => {
    const { baseUrl, workDir } = await start();
    const filePath = join(workDir, "real.mp4");
    writeFileSync(filePath, "pretend video bytes");

    const res = await fetch(`${baseUrl}/api/local-video?path=${encodeURIComponent(filePath)}`);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("pretend video bytes");
  });

  it("HEAD returns 200 with Content-Length and no body for an existing file (Finding 3's existence check)", async () => {
    const { baseUrl, workDir } = await start();
    const filePath = join(workDir, "real.mp4");
    writeFileSync(filePath, "pretend video bytes");

    const res = await fetch(`${baseUrl}/api/local-video?path=${encodeURIComponent(filePath)}`, {
      method: "HEAD",
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-length")).toBe(String("pretend video bytes".length));
    expect(await res.text()).toBe("");
  });

  it("HEAD returns 404 for a file that doesn't exist", async () => {
    const { baseUrl, workDir } = await start();
    const filePath = join(workDir, "missing.mp4");

    const res = await fetch(`${baseUrl}/api/local-video?path=${encodeURIComponent(filePath)}`, {
      method: "HEAD",
    });
    expect(res.status).toBe(404);
  });
});
