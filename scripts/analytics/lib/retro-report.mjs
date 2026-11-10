// Pure half of the episode retro: turns raw YouTube Analytics rows into a same-age comparison.
// "Same age" is the point - every video is measured over its own first N days after publish, so
// an old upload's months of accumulated views never get compared against a new upload's first
// week. No network, no clock: everything here is unit-tested from fixtures.

/**
 * The first-N-days window for a video, as YouTube Analytics dates (Pacific-time days, which is
 * how the API buckets `day`). Returns inclusive YYYY-MM-DD bounds.
 */
export function windowDates(publishedAt, days) {
  const start = pacificDate(new Date(publishedAt));
  return { startDate: start, endDate: addDays(start, days - 1) };
}

/** Whether a video's full first-N-days window has already elapsed as of `now`. */
export function isWindowComplete(publishedAt, days, now) {
  return windowDates(publishedAt, days).endDate < pacificDate(new Date(now));
}

/**
 * Collapses one video's totals row and per-traffic-source rows into a flat summary.
 * `totals`: { views, estimatedMinutesWatched, averageViewPercentage, subscribersGained }.
 * `bySource`: [{ insightTrafficSourceType, views }].
 */
export function summarizeVideo(video, totals, bySource) {
  const sources = Object.fromEntries(SOURCE_COLUMNS.map((c) => [c, 0]));
  for (const row of bySource) {
    const column = SOURCE_BY_API_TYPE[row.insightTrafficSourceType] ?? "other";
    sources[column] += Number(row.views ?? 0);
  }
  return {
    videoId: video.videoId,
    title: video.title,
    publishedAt: video.publishedAt,
    views: Number(totals?.views ?? 0),
    minutesWatched: Number(totals?.estimatedMinutesWatched ?? 0),
    averageViewPercentage: Number(totals?.averageViewPercentage ?? 0),
    subscribersGained: Number(totals?.subscribersGained ?? 0),
    sources,
  };
}

/**
 * Renders the retro as markdown: one row per video (newest first), each measured over its own
 * first `days` days, plus a verdict line per video on the one signal that has separated this
 * kind of channel's hits from its flops - how many views the suggested feed delivered - against
 * the median of the other videos in the report.
 */
export function buildRetroMarkdown(summaries, { days, generatedAt }) {
  const rows = [...summaries].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  const lines = [
    `# YouTube retro: first ${days} days per video`,
    "",
    `Generated ${generatedAt}. Every row covers that video's own first ${days} days after publish`,
    "(Pacific-time days), so videos of different ages are compared at the same age.",
    "Impressions and click-through rate are not in this report - read those in YouTube Studio.",
    "",
    "| Published | Video | Views | Avg view % | Subs | Suggested | Search | Browse | Direct | Shorts feed | Other |",
    "|---|---|---|---|---|---|---|---|---|---|---|",
    ...rows.map((s) =>
      [
        "",
        s.publishedAt.slice(0, 10),
        s.title.replaceAll("|", "/"),
        s.views,
        `${s.averageViewPercentage.toFixed(1)}%`,
        s.subscribersGained,
        ...SOURCE_COLUMNS.map((c) => withShare(s.sources[c], s.views)),
        "",
      ]
        .join(" | ")
        .trim(),
    ),
    "",
    "## Suggested-feed pickup",
    "",
    ...rows.map((s) => `- ${s.publishedAt.slice(0, 10)} ${s.title}: ${suggestedVerdict(s, rows)}`),
  ];
  return `${lines.join("\n")}\n`;
}

/** Suggested views vs the median of the OTHER videos in the report. */
export function suggestedVerdict(summary, all) {
  const others = all.filter((s) => s.videoId !== summary.videoId).map((s) => s.sources.suggested);
  const own = summary.sources.suggested;
  if (others.length === 0) return `${own} suggested views (nothing to compare against yet)`;
  const baseline = median(others);
  if (baseline === 0) return `${own} suggested views (baseline is 0)`;
  const ratio = own / baseline;
  const label = ratio >= PICKED_UP_RATIO ? "picked up" : ratio <= IGNORED_RATIO ? "not picked up" : "typical";
  return `${own} suggested views, ${ratio.toFixed(1)}x the median of the others (${baseline}) - ${label}`;
}

export function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function withShare(count, total) {
  return total > 0 ? `${count} (${Math.round((count / total) * 100)}%)` : String(count);
}

function pacificDate(date) {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(date);
}

function addDays(isoDate, n) {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export const SOURCE_COLUMNS = ["suggested", "search", "browse", "direct", "shorts", "other"];

// YouTube Analytics `insightTrafficSourceType` values -> report column. Anything unlisted
// (playlists, channel pages, external sites, notifications, ...) lands in "other".
const SOURCE_BY_API_TYPE = {
  RELATED_VIDEO: "suggested",
  YT_SEARCH: "search",
  SUBSCRIBER: "browse",
  NO_LINK_OTHER: "direct",
  SHORTS: "shorts",
};

const PICKED_UP_RATIO = 3;
const IGNORED_RATIO = 0.5;
