import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { registerMediaMiddleware } from "../../src/server/media.js";
import { startTestServer, type TestServerHandle } from "../helpers/testServer.js";

describe("GET /clips", () => {
  let handle: TestServerHandle | null = null;

  afterEach(async () => {
    await handle?.close();
    handle = null;
  });

  async function start(clipDir: string): Promise<{ baseUrl: string }> {
    const workDir = mkdtempSync(join(tmpdir(), "cuesheet-web-clipsroute-"));
    const cuesheetPath = join(workDir, "project.cuesheet.json");
    writeFileSync(cuesheetPath, JSON.stringify({ clipDir }));
    handle = await startTestServer((server) => {
      registerMediaMiddleware(server, cuesheetPath);
    });
    return { baseUrl: handle.baseUrl };
  }

  it("serves a clip whose name includes a raw-footage-sorting event-subfolder segment", async () => {
    const clipDir = mkdtempSync(join(tmpdir(), "cuesheet-web-clips-"));
    mkdirSync(join(clipDir, "001_label_260609"), { recursive: true });
    writeFileSync(join(clipDir, "001_label_260609", "clip.mp4"), "pretend video bytes");
    const { baseUrl } = await start(clipDir);

    const res = await fetch(`${baseUrl}/clips/${encodeURIComponent("001_label_260609/clip.mp4")}`);

    expect(res.status).toBe(200);
    expect(await res.text()).toBe("pretend video bytes");
  });

  it("rejects a clip name that resolves outside clipDir (path traversal)", async () => {
    const clipDir = mkdtempSync(join(tmpdir(), "cuesheet-web-clips-"));
    const { baseUrl } = await start(clipDir);

    const res = await fetch(`${baseUrl}/clips/${encodeURIComponent("../../etc/passwd")}`);

    expect(res.status).toBe(400);
  });

  it("404s for a clip that doesn't exist in clipDir", async () => {
    const clipDir = mkdtempSync(join(tmpdir(), "cuesheet-web-clips-"));
    const { baseUrl } = await start(clipDir);

    const res = await fetch(`${baseUrl}/clips/${encodeURIComponent("missing.mp4")}`);

    expect(res.status).toBe(404);
  });
});
