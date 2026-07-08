import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { registerRoutes } from "../../src/server/routes.js";
import { createCuesheetWatcher } from "../../src/server/watch.js";
import { startTestServer, type TestServerHandle } from "../helpers/testServer.js";
import { makeCueSheet } from "../helpers/fixtures.js";

describe("routes", () => {
  let workDir: string;
  let cuesheetPath: string;
  let handle: TestServerHandle | null = null;

  beforeEach(() => {
    workDir = mkdtempSync(join(tmpdir(), "cuesheet-web-routes-"));
    cuesheetPath = join(workDir, "project.cuesheet.json");
  });

  afterEach(async () => {
    await handle?.close();
    handle = null;
  });

  async function start(options?: Parameters<typeof registerRoutes>[3]): Promise<TestServerHandle> {
    handle = await startTestServer((server) => {
      registerRoutes(server, cuesheetPath, createCuesheetWatcher(), options);
    });
    return handle;
  }

  describe("POST /api/cuesheet", () => {
    it("rejects an invalid cuesheet with a fieldpath: reason error", async () => {
      const { baseUrl } = await start();
      const invalid = {
        ...makeCueSheet(),
        segments: [{ clip: "a.mp4", in: 5, out: 5, speed: 1, volume: 1, subtitle: "" }],
      };

      const res = await fetch(`${baseUrl}/api/cuesheet`, {
        method: "POST",
        body: JSON.stringify(invalid),
      });

      expect(res.status).toBe(400);
      const body = (await res.json()) as { ok: boolean; errors: string[] };
      expect(body.ok).toBe(false);
      expect(body.errors[0]).toMatch(/^segments\[0\]\.in: /);
    });

    it("refuses to save when an unrecognized field would be silently stripped (lost-keys guard)", async () => {
      const { baseUrl } = await start();
      const withUnknownField = { ...makeCueSheet(), unknownField: "should not be dropped" };

      const res = await fetch(`${baseUrl}/api/cuesheet`, {
        method: "POST",
        body: JSON.stringify(withUnknownField),
      });

      expect(res.status).toBe(400);
      const body = (await res.json()) as { ok: boolean; errors: string[] };
      expect(body.ok).toBe(false);
      expect(body.errors[0]).toMatch(/lost fields: unknownField/);
    });
  });

  describe("GET /api/cuesheet", () => {
    it("returns 404 with the empty-state text when no draft exists yet", async () => {
      const { baseUrl } = await start();

      const res = await fetch(`${baseUrl}/api/cuesheet`);

      expect(res.status).toBe(404);
      const text = await res.text();
      expect(text).toBe(
        "No draft yet - run pnpm episode with a source folder to generate one automatically.",
      );
    });
  });

  describe("POST /api/upload-clip", () => {
    it("rejects a missing filename query param", async () => {
      const { baseUrl } = await start();

      const res = await fetch(`${baseUrl}/api/upload-clip`, { method: "POST", body: "x" });

      expect(res.status).toBe(400);
      const body = (await res.json()) as { ok: boolean; error: string };
      expect(body.ok).toBe(false);
      expect(body.error).toMatch(/filename query parameter is required/);
    });

    it("rejects a path-traversal filename", async () => {
      const { baseUrl } = await start();

      const res = await fetch(`${baseUrl}/api/upload-clip?filename=${encodeURIComponent("../evil.mp4")}`, {
        method: "POST",
        body: "x",
      });

      expect(res.status).toBe(400);
      const body = (await res.json()) as { ok: boolean; error: string };
      expect(body.error).toMatch(/must be a plain file name/);
    });

    it("rejects an unsupported extension", async () => {
      const { baseUrl } = await start();

      const res = await fetch(`${baseUrl}/api/upload-clip?filename=clip.avi`, {
        method: "POST",
        body: "x",
      });

      expect(res.status).toBe(400);
      const body = (await res.json()) as { ok: boolean; error: string };
      expect(body.error).toMatch(/Unsupported file type/);
    });

    it("rejects a duplicate file name already present in clipDir", async () => {
      const clipDir = mkdtempSync(join(tmpdir(), "cuesheet-web-clips-"));
      writeFileSync(join(clipDir, "existing.mp4"), "already here");
      writeFileSync(cuesheetPath, JSON.stringify(makeCueSheet({ clipDir })));
      const { baseUrl } = await start();

      const res = await fetch(`${baseUrl}/api/upload-clip?filename=existing.mp4`, {
        method: "POST",
        body: "new content",
      });

      expect(res.status).toBe(409);
      const body = (await res.json()) as { ok: boolean; error: string };
      expect(body.error).toMatch(/already exists/);
    });

    it("rejects a payload larger than the configured cap", async () => {
      const clipDir = mkdtempSync(join(tmpdir(), "cuesheet-web-clips-"));
      writeFileSync(cuesheetPath, JSON.stringify(makeCueSheet({ clipDir })));
      const { baseUrl } = await start({ uploadClipMaxBytes: 10 });

      const res = await fetch(`${baseUrl}/api/upload-clip?filename=new.mp4`, {
        method: "POST",
        body: "x".repeat(1000),
      });

      expect(res.status).toBe(413);
      const body = (await res.json()) as { ok: boolean; error: string };
      expect(body.error).toMatch(/too large/);
    });
  });

  describe("GET /api/bgm-files", () => {
    it("reports no files found when clipDir and media root are both empty", async () => {
      const clipDir = mkdtempSync(join(tmpdir(), "cuesheet-web-clips-"));
      const mediaRoot = mkdtempSync(join(tmpdir(), "cuesheet-web-media-"));
      writeFileSync(cuesheetPath, JSON.stringify(makeCueSheet({ clipDir })));
      const { baseUrl } = await start({ mediaRoot });

      const res = await fetch(`${baseUrl}/api/bgm-files`);

      expect(res.status).toBe(200);
      const body = (await res.json()) as { files: unknown[]; note?: string };
      expect(body.files).toEqual([]);
      expect(body.note).toMatch(/No audio files found/);
    });

    it("lists audio files found under the media root and clipDir", async () => {
      const clipDir = mkdtempSync(join(tmpdir(), "cuesheet-web-clips-"));
      const mediaRoot = mkdtempSync(join(tmpdir(), "cuesheet-web-media-"));
      mkdirSync(join(mediaRoot, "bgm"), { recursive: true });
      writeFileSync(join(mediaRoot, "bgm", "lofi.mp3"), "fake mp3 bytes");
      writeFileSync(cuesheetPath, JSON.stringify(makeCueSheet({ clipDir })));
      const { baseUrl } = await start({ mediaRoot });

      const res = await fetch(`${baseUrl}/api/bgm-files`);

      expect(res.status).toBe(200);
      const body = (await res.json()) as { files: { path: string }[]; note?: string };
      // mediaRoot here is a tmp dir outside repoRoot, so collectAudioFiles falls back to the
      // absolute path display form (the repo-relative form only applies to files under repoRoot).
      expect(body.files.map((f) => f.path)).toEqual([join(mediaRoot, "bgm", "lofi.mp3")]);
      expect(body.note).toBeUndefined();
    });
  });
});
