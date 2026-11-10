// Network half of the episode retro: thin wrappers over Google's OAuth token endpoint, the
// YouTube Data API (list uploads) and the YouTube Analytics API (reports.query). `fetchImpl` is
// injected so the request shapes are unit-tested without a network.

/** Exchanges a long-lived refresh token for a short-lived access token. */
export async function getAccessToken({ clientId, clientSecret, refreshToken }, fetchImpl = fetch) {
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });
  const json = await requestJson(fetchImpl, TOKEN_URL, { method: "POST", body });
  return json.access_token;
}

/** The authorized channel's most recent uploads, newest first: [{ videoId, title, publishedAt }]. */
export async function listUploads(accessToken, max, fetchImpl = fetch) {
  const channels = await requestJson(
    fetchImpl,
    `${DATA_API}/channels?part=contentDetails&mine=true`,
    authorized(accessToken),
  );
  const uploads = channels.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
  if (!uploads) throw new Error("No uploads playlist found for the authorized channel");
  const items = await requestJson(
    fetchImpl,
    `${DATA_API}/playlistItems?part=snippet,contentDetails&playlistId=${uploads}&maxResults=${Math.min(max, 50)}`,
    authorized(accessToken),
  );
  return (items.items ?? []).map((item) => ({
    videoId: item.contentDetails.videoId,
    title: item.snippet.title,
    publishedAt: item.contentDetails.videoPublishedAt ?? item.snippet.publishedAt,
  }));
}

/** One reports.query call for a single video; returns rows as objects keyed by column name. */
export async function queryVideoReport(accessToken, { videoId, startDate, endDate, metrics, dimensions }, fetchImpl = fetch) {
  const params = new URLSearchParams({
    ids: "channel==MINE",
    startDate,
    endDate,
    metrics: metrics.join(","),
    filters: `video==${videoId}`,
  });
  if (dimensions?.length) params.set("dimensions", dimensions.join(","));
  const json = await requestJson(fetchImpl, `${ANALYTICS_API}/reports?${params}`, authorized(accessToken));
  return rowsToObjects(json);
}

/** Zips a reports.query response's columnHeaders with each row. */
export function rowsToObjects(response) {
  const names = (response.columnHeaders ?? []).map((h) => h.name);
  return (response.rows ?? []).map((row) => Object.fromEntries(names.map((name, i) => [name, row[i]])));
}

async function requestJson(fetchImpl, url, init) {
  const res = await fetchImpl(url, init);
  if (!res.ok) {
    throw new Error(`${new URL(url).pathname} failed: HTTP ${res.status} ${await res.text()}`);
  }
  return res.json();
}

function authorized(accessToken) {
  return { headers: { Authorization: `Bearer ${accessToken}` } };
}

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const DATA_API = "https://www.googleapis.com/youtube/v3";
const ANALYTICS_API = "https://youtubeanalytics.googleapis.com/v2";
