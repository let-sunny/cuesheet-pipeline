import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { registerDraftFramesRoute } from "../../src/server/media/draftFramesRoute.js";
import { startTestServer, type TestServerHandle } from "../helpers/testServer.js";

describe("draft-frames routes with a raw-footage-sorting event-subfolder clip path", () => {
  let handle: TestServerHandle | null = null;
  let prevMomentsPath: string | undefined;

  beforeEach(() => {
    prevMomentsPath = process.env.MOMENTS_PATH;
  });

  afterEach(async () => {
    await handle?.close();
    handle = null;
    if (prevMomentsPath === undefined) delete process.env.MOMENTS_PATH;
    else process.env.MOMENTS_PATH = prevMomentsPath;
  });

  async function start(): Promise<{ baseUrl: string; framesRoot: string }> {
    const draftDir = mkdtempSync(join(tmpdir(), "cuesheet-web-draftframes-"));
    process.env.MOMENTS_PATH = join(draftDir, "moments.json");
    const framesDir = join(draftDir, "frames");
    handle = await startTestServer((server) => {
      registerDraftFramesRoute(server);
    });
    return { baseUrl: handle.baseUrl, framesRoot: framesDir };
  }

  it("GET /api/draft-frames/<subfolder clip path> lists frame files, not rejected for containing '/'", async () => {
    const { baseUrl, framesRoot } = await start();
    const clipFramesDir = join(framesRoot, "001_label_260609", "VID_001");
    mkdirSync(clipFramesDir, { recursive: true });
    writeFileSync(join(clipFramesDir, "t00000.jpg"), "");
    writeFileSync(join(clipFramesDir, "t00005.jpg"), "");

    const res = await fetch(`${baseUrl}/api/draft-frames/${encodeURIComponent("001_label_260609/VID_001")}`);

    expect(res.status).toBe(200);
    const files = (await res.json()) as string[];
    expect(files.sort()).toEqual(["t00000.jpg", "t00005.jpg"]);
  });

  it("GET /draft-frames/<subfolder clip path>/<frame> serves the frame file", async () => {
    const { baseUrl, framesRoot } = await start();
    const clipFramesDir = join(framesRoot, "001_label_260609", "VID_001");
    mkdirSync(clipFramesDir, { recursive: true });
    writeFileSync(join(clipFramesDir, "t00000.jpg"), "pretend jpeg bytes");

    const res = await fetch(
      `${baseUrl}/draft-frames/${encodeURIComponent("001_label_260609/VID_001")}/${encodeURIComponent("t00000.jpg")}`,
    );

    expect(res.status).toBe(200);
    expect(await res.text()).toBe("pretend jpeg bytes");
  });

  it("GET /api/draft-frames rejects a path that resolves outside framesRoot (path traversal)", async () => {
    const { baseUrl } = await start();

    const res = await fetch(`${baseUrl}/api/draft-frames/${encodeURIComponent("../../etc")}`);

    expect(res.status).toBe(400);
  });
});
