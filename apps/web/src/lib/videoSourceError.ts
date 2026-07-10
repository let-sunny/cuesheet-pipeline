export type VideoSourceErrorKind = "missing" | "undecodable";

/**
 * [situation] + [next action] message for each of <video>'s two distinct failure classes
 * (status-text principle) - a missing file (never uploaded/moved/deleted) vs. a file that exists
 * but isn't playable video (e.g. a .txt renamed to .mp4).
 */
export function videoSourceErrorMessage(kind: VideoSourceErrorKind, clip: string): string {
  if (kind === "missing") {
    return `Can't find the source: ${clip || "(no filename)"}`;
  }
  return "This file exists but can't be played as video - re-export or replace it.";
}

/**
 * Maps whether a supplementary fetch of the video's own src succeeded to which failure class an
 * unplayable <video> falls into.
 *
 * This can't be done from the <video> error event's own MediaError.code - verified empirically
 * against real Chromium: a true 404 and a 200 response whose body simply isn't decodable video
 * both land on the exact same code (4, MEDIA_ERR_SRC_NOT_SUPPORTED) and the same networkState (3,
 * NETWORK_NO_SOURCE). There is no code-based signal that tells the two apart, so an actual HTTP
 * existence check of the same src is required.
 */
export function classifyVideoSourceError(fetchOk: boolean): VideoSourceErrorKind {
  return fetchOk ? "undecodable" : "missing";
}
