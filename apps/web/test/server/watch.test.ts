import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { ViteDevServer } from "vite";
import { createCuesheetWatcher } from "../../src/server/watch.js";

/** Fake server exposing just what CuesheetWatcher.attach touches: ws.send + optional httpServer. */
function createFakeServer(): { server: ViteDevServer; events: string[] } {
  const events: string[] = [];
  const server = {
    ws: {
      send: (msg: { event?: string }) => {
        events.push(msg.event ?? "");
      },
    },
    httpServer: null,
  } as unknown as ViteDevServer;
  return { server, events };
}

/** Polls until `events.length >= count` or times out (fs.watch delivery isn't instant). */
async function waitForEventCount(events: string[], count: number, timeoutMs = 3000): Promise<void> {
  const start = Date.now();
  while (events.length < count) {
    if (Date.now() - start > timeoutMs) {
      throw new Error(`Timed out waiting for ${count} event(s), got ${events.length}`);
    }
    await new Promise((r) => setTimeout(r, 25));
  }
}

describe("createCuesheetWatcher", () => {
  let workDir: string;

  afterEach(() => {
    if (workDir) {
      rmSync(workDir, { recursive: true, force: true });
    }
  });

  it("notifies once the watched file appears later (dir-watch -> file-watch switch-over)", async () => {
    workDir = mkdtempSync(join(tmpdir(), "cuesheet-web-watch-"));
    const filePath = join(workDir, "project.cuesheet.json");
    const { server, events } = createFakeServer();
    const watcher = createCuesheetWatcher();

    watcher.attach(server, filePath);
    expect(events).toEqual([]);

    writeFileSync(filePath, JSON.stringify({ v: 1 }));
    await waitForEventCount(events, 1);
    expect(events[0]).toBe("cuesheet:changed");

    // Now that it switched to file-watch mode, an external edit should also notify.
    writeFileSync(filePath, JSON.stringify({ v: 2 }));
    await waitForEventCount(events, 2);
  });

  it("does not notify for the server's own write, but reattaches and notifies on delete + recreate", async () => {
    workDir = mkdtempSync(join(tmpdir(), "cuesheet-web-watch-"));
    const filePath = join(workDir, "project.cuesheet.json");
    const initialContent = JSON.stringify({ v: 1 });
    writeFileSync(filePath, initialContent);

    const { server, events } = createFakeServer();
    const watcher = createCuesheetWatcher();
    watcher.attach(server, filePath);

    // Simulate the server itself saving: mark the write, then perform it - no notification expected.
    watcher.markOwnWrite(initialContent);
    writeFileSync(filePath, initialContent);
    // Give fs.watch a moment to fire (it shouldn't produce a notify event for this one).
    await new Promise((r) => setTimeout(r, 300));
    expect(events).toEqual([]);

    // Delete the file - should notify (empty-state) and switch to directory-watch mode.
    rmSync(filePath);
    await waitForEventCount(events, 1);
    expect(events[0]).toBe("cuesheet:changed");

    // Recreate the file - directory-watch should detect it, switch back to file-watch, and notify again.
    writeFileSync(filePath, JSON.stringify({ v: 3 }));
    await waitForEventCount(events, 2);
  });
});
