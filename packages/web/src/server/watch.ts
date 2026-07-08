import { existsSync, mkdirSync, watch, type FSWatcher } from "node:fs";
import { readFile } from "node:fs/promises";
import { basename, dirname } from "node:path";
import type { ViteDevServer } from "vite";

/**
 * Detects cuesheet file changes and notifies the client via an HMR custom event.
 *
 * The file may not exist yet at server startup (e.g. `pnpm episode` starts the server first
 * and the /episode pipeline generates the cuesheet later). In that case, watch the parent
 * directory instead of the file, and switch to watching the file the moment it appears. If the
 * file gets deleted and recreated (a rename event), the same switch-over logic reattaches so
 * the watch never ends up orphaned.
 */
export interface CuesheetWatcher {
  /**
   * Marks content this server itself just wrote to the cuesheet file - the next fs event that
   * matches this content is treated as our own save (no client notification), rather than an
   * external change (e.g. the bridge or a direct edit).
   */
  markOwnWrite(content: string): void;
  /** Attaches file/dir watching for filePath to server, sending "cuesheet:changed" HMR events on external changes. */
  attach(server: ViteDevServer, filePath: string): void;
}

export function createCuesheetWatcher(): CuesheetWatcher {
  // The last content the server itself wrote. If this matches inside the fs.watch callback,
  // the event was caused by our own save, so don't notify the client.
  let lastWrittenContent: string | null = null;
  let watcher: FSWatcher | null = null;

  function markOwnWrite(content: string): void {
    lastWrittenContent = content;
  }

  function attach(server: ViteDevServer, filePath: string): void {
    const notifyChanged = () => {
      server.ws.send({ type: "custom", event: "cuesheet:changed" });
    };

    const watchFile = () => {
      watcher?.close();
      watcher = watch(filePath, () => {
        void (async () => {
          if (!existsSync(filePath)) {
            // Deleted (a rename event) - switch to watching the directory, waiting for it to be
            // recreated, and notify the client so it refetches and shows the empty-state banner.
            watchDir();
            notifyChanged();
            return;
          }
          let current: string;
          try {
            current = await readFile(filePath, "utf8");
          } catch {
            return;
          }
          if (current === lastWrittenContent) {
            // This is exactly what this server just saved, so don't notify about an external change.
            return;
          }
          notifyChanged();
        })();
      });
    };

    const watchDir = () => {
      watcher?.close();
      const dir = dirname(filePath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
      const targetName = basename(filePath);
      watcher = watch(dir, (_eventType, changedName) => {
        if (changedName !== targetName || !existsSync(filePath)) {
          return;
        }
        // The target file has appeared - switch to watching the file and tell the client to load it for the first time.
        watchFile();
        notifyChanged();
      });
    };

    if (existsSync(filePath)) {
      watchFile();
    } else {
      watchDir();
    }
    server.httpServer?.once("close", () => watcher?.close());
  }

  return { markOwnWrite, attach };
}
