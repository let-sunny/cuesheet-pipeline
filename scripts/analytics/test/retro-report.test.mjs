import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  buildRetroMarkdown,
  isWindowComplete,
  median,
  suggestedVerdict,
  summarizeVideo,
  windowDates,
} from "../lib/retro-report.mjs";
import { getAccessToken, listUploads, queryVideoReport, rowsToObjects } from "../lib/youtube-api.mjs";

const video = (videoId, publishedAt, title = videoId) => ({ videoId, title, publishedAt });
const summary = (videoId, publishedAt, suggested, views = 100) =>
  summarizeVideo(video(videoId, publishedAt), { views }, [
    { insightTrafficSourceType: "RELATED_VIDEO", views: suggested },
  ]);

describe("windowDates", () => {
  it("starts on the Pacific-time publish day and spans N inclusive days", () => {
    // 03:00 UTC on 6 Nov is still 5 Nov in Los Angeles.
    expect(windowDates("2026-11-06T03:00:00Z", 8)).toEqual({ startDate: "2026-11-05", endDate: "2026-11-12" });
  });

  it("knows whether the window has fully elapsed", () => {
    expect(isWindowComplete("2026-11-01T20:00:00Z", 8, "2026-11-09T20:00:00Z")).toBe(true);
    expect(isWindowComplete("2026-11-01T20:00:00Z", 8, "2026-11-08T20:00:00Z")).toBe(false);
  });
});

describe("summarizeVideo", () => {
  it("maps API traffic-source types onto report columns and folds the rest into other", () => {
    const s = summarizeVideo(
      video("v1", "2026-01-01T00:00:00Z"),
      { views: 130, estimatedMinutesWatched: 90, averageViewPercentage: 31.3, subscribersGained: 2 },
      [
        { insightTrafficSourceType: "RELATED_VIDEO", views: 8 },
        { insightTrafficSourceType: "YT_SEARCH", views: 20 },
        { insightTrafficSourceType: "SUBSCRIBER", views: 57 },
        { insightTrafficSourceType: "NO_LINK_OTHER", views: 30 },
        { insightTrafficSourceType: "PLAYLIST", views: 10 },
        { insightTrafficSourceType: "YT_CHANNEL", views: 5 },
      ],
    );
    expect(s.sources).toEqual({ suggested: 8, search: 20, browse: 57, direct: 30, shorts: 0, other: 15 });
    expect(s.averageViewPercentage).toBe(31.3);
  });

  it("tolerates a video with no data rows", () => {
    expect(summarizeVideo(video("v1", "2026-01-01T00:00:00Z"), null, []).views).toBe(0);
  });
});

describe("suggestedVerdict", () => {
  const all = [summary("a", "2026-01-01", 10), summary("b", "2026-02-01", 20), summary("c", "2026-03-01", 300)];

  it("flags a video the suggested feed picked up against the median of the others", () => {
    expect(suggestedVerdict(all[2], all)).toBe("300 suggested views, 20.0x the median of the others (15) - picked up");
  });

  it("flags a video that was not picked up", () => {
    expect(suggestedVerdict(all[0], all)).toMatch(/0\.1x .* - not picked up$/);
  });

  it("does not divide by a zero or missing baseline", () => {
    expect(suggestedVerdict(all[0], [all[0]])).toMatch(/nothing to compare/);
    expect(suggestedVerdict(all[0], [all[0], summary("z", "2026-01-02", 0)])).toMatch(/baseline is 0/);
  });

  it("median handles even and odd counts", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
  });
});

describe("buildRetroMarkdown", () => {
  it("lists newest first, shows source share, and escapes pipes in titles", () => {
    const md = buildRetroMarkdown(
      [summary("old", "2026-01-01T00:00:00Z", 10), summarizeVideo(video("new", "2026-02-01T00:00:00Z", "knit | vest"), { views: 200 }, [{ insightTrafficSourceType: "RELATED_VIDEO", views: 50 }])],
      { days: 8, generatedAt: "2026-11-10" },
    );
    const rows = md.split("\n").filter((l) => l.startsWith("| 2026"));
    expect(rows[0]).toContain("| 2026-02-01 | knit / vest | 200 |");
    expect(rows[0]).toContain("50 (25%)");
    expect(rows[1]).toContain("| 2026-01-01 | old |");
    expect(md).toContain("first 8 days");
  });
});

describe("youtube-api request shapes", () => {
  const fakeFetch = (responses) => {
    const calls = [];
    const impl = async (url, init) => {
      calls.push({ url: String(url), init });
      return { ok: true, json: async () => responses.shift() };
    };
    return { impl, calls };
  };

  it("exchanges the refresh token", async () => {
    const { impl, calls } = fakeFetch([{ access_token: "tok" }]);
    expect(await getAccessToken({ clientId: "id", clientSecret: "sec", refreshToken: "ref" }, impl)).toBe("tok");
    expect(calls[0].url).toBe("https://oauth2.googleapis.com/token");
    expect(String(calls[0].init.body)).toContain("grant_type=refresh_token");
  });

  it("lists uploads through the channel's uploads playlist", async () => {
    const { impl, calls } = fakeFetch([
      { items: [{ contentDetails: { relatedPlaylists: { uploads: "UU123" } } }] },
      { items: [{ contentDetails: { videoId: "v1", videoPublishedAt: "2026-06-07T10:00:00Z" }, snippet: { title: "EP" } }] },
    ]);
    expect(await listUploads("tok", 5, impl)).toEqual([{ videoId: "v1", title: "EP", publishedAt: "2026-06-07T10:00:00Z" }]);
    expect(calls[1].url).toContain("playlistId=UU123&maxResults=5");
    expect(calls[1].init.headers.Authorization).toBe("Bearer tok");
  });

  it("queries one video's window and zips rows with column headers", async () => {
    const { impl, calls } = fakeFetch([
      { columnHeaders: [{ name: "insightTrafficSourceType" }, { name: "views" }], rows: [["YT_SEARCH", 20]] },
    ]);
    const rows = await queryVideoReport(
      "tok",
      { videoId: "v1", startDate: "2026-06-07", endDate: "2026-06-14", metrics: ["views"], dimensions: ["insightTrafficSourceType"] },
      impl,
    );
    expect(rows).toEqual([{ insightTrafficSourceType: "YT_SEARCH", views: 20 }]);
    const url = new URL(calls[0].url);
    expect(url.searchParams.get("filters")).toBe("video==v1");
    expect(url.searchParams.get("ids")).toBe("channel==MINE");
    expect(rowsToObjects({})).toEqual([]);
  });

  it("surfaces HTTP failures with the endpoint path", async () => {
    const impl = async () => ({ ok: false, status: 403, text: async () => "forbidden" });
    await expect(listUploads("tok", 5, impl)).rejects.toThrow(/channels failed: HTTP 403 forbidden/);
  });
});

describe("youtube-retro CLI --from", () => {
  it("rebuilds the markdown report offline from a raw dump", () => {
    const dir = mkdtempSync(join(tmpdir(), "retro-"));
    try {
      const rawPath = join(dir, "raw.json");
      writeFileSync(
        rawPath,
        JSON.stringify({
          days: 8,
          generatedAt: "2026-11-10",
          videos: [
            { video: video("v1", "2026-06-07T10:00:00Z", "EP.20"), totals: { views: 130 }, bySource: [{ insightTrafficSourceType: "RELATED_VIDEO", views: 8 }] },
          ],
        }),
      );
      const cli = join(dirname(fileURLToPath(import.meta.url)), "..", "youtube-retro.mjs");
      const out = execFileSync("node", [cli, "--from", rawPath], { encoding: "utf-8" });
      expect(out).toContain("| 2026-06-07 | EP.20 | 130 |");
      expect(out).toContain("8 (6%)");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
