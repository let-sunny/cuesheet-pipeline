import { useEffect, useState } from "react";
import { fetchBgmFiles, fetchMoments, fetchNarrationFiles, type BgmFile, type ClipMoments, type NarrationFile } from "../api.js";
import { computeClipDurations } from "../clipPaths.js";

export interface UseProjectResourcesOptions {
  /** Only refetches the narration file listing while narration is in use (also refetches if dir changes). */
  narrationEnabled: boolean;
  narrationDir: string | undefined;
}

export interface UseProjectResourcesResult {
  /** Raw rough vision-reading data — used to show "what scene is this cut" by matching it in the
      cut list/inspector/sequence playback (shares the same fetchMoments call result as clipDurations). */
  moments: ClipMoments[];
  /** Approximate duration per clip (seconds) — used to judge the 15s cap for the intro/outro
      assign buttons (palette/inspector). If the fetch fails, editing still isn't blocked; it's
      just left as an empty map (everything treated as "unknown"). */
  clipDurations: Record<string, number>;
  /** List of audio files inside narration.dir (only refreshed while narration is in use). */
  narrationFiles: NarrationFile[];
  /** Info message for e.g. an unset/nonexistent narration folder. */
  narrationNote: string | undefined;
  /** List of audio files usable as background music (media/ + clipDir) - for the BGM settings
      panel's file picker/pre-listen. Fetched once; clipDir rarely changes mid-session. */
  bgmFiles: BgmFile[];
  bgmFilesNote: string | undefined;
}

/**
 * Fetches the read-only supporting data lists the editor draws from across steps: draft
 * vision-analysis moments (+ derived clip durations), the narration folder's file listing (only
 * while narration is enabled), and the available background-music files. None of these feed back
 * into the cuesheet itself - they're display/picker data, refetched independently of it.
 */
export function useProjectResources({
  narrationEnabled,
  narrationDir,
}: UseProjectResourcesOptions): UseProjectResourcesResult {
  const [clipDurations, setClipDurations] = useState<Record<string, number>>({});
  const [moments, setMoments] = useState<ClipMoments[]>([]);
  const [narrationFiles, setNarrationFiles] = useState<NarrationFile[]>([]);
  const [narrationNote, setNarrationNote] = useState<string | undefined>(undefined);
  const [bgmFiles, setBgmFiles] = useState<BgmFile[]>([]);
  const [bgmFilesNote, setBgmFilesNote] = useState<string | undefined>(undefined);

  useEffect(() => {
    void (async () => {
      try {
        const data = await fetchMoments();
        setMoments(data);
        setClipDurations(computeClipDurations(data));
      } catch {
        // Editing continues even without moment data — only the intro/outro assign buttons get
        // disabled as "duration unknown", and scene displays all become "no info".
      }
    })();
  }, []);

  // Only refreshes the file listing inside the folder while narration is in use (also refetches if dir changes).
  useEffect(() => {
    if (!narrationEnabled) {
      setNarrationFiles([]);
      setNarrationNote(undefined);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const result = await fetchNarrationFiles(narrationDir);
        if (cancelled) {
          return;
        }
        setNarrationFiles(result.files);
        setNarrationNote(result.note);
      } catch {
        if (!cancelled) {
          setNarrationFiles([]);
          setNarrationNote("Couldn't load the narration file list");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [narrationEnabled, narrationDir]);

  useEffect(() => {
    void (async () => {
      try {
        const result = await fetchBgmFiles();
        setBgmFiles(result.files);
        setBgmFilesNote(result.note);
      } catch {
        setBgmFiles([]);
        setBgmFilesNote("Couldn't load the background music file list");
      }
    })();
  }, []);

  return { moments, clipDurations, narrationFiles, narrationNote, bgmFiles, bgmFilesNote };
}
