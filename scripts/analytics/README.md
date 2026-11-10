# Episode retro (`pnpm retro`)

Pulls each recent upload's **own first N days** from the YouTube Analytics API and prints a
same-age comparison as markdown: views, average view %, subscribers gained, and views by traffic
source (suggested / search / browse / direct / Shorts feed / other), plus a verdict per video on
whether the suggested feed picked it up relative to the others.

```bash
pnpm retro                                  # last 12 uploads, first 8 days each, markdown to stdout
pnpm retro --days 8 --max 20 --out retro.md --dump raw.json
pnpm retro --from raw.json                  # rebuild the report offline from a previous --dump
```

A video still inside its first N days is skipped, so nothing is compared at a younger age.

## What it does not cover

Thumbnail impressions and click-through rate are not requested - read those in YouTube Studio
(Reach tab). Views arriving from the suggested feed are used as the pickup signal instead.

## Credentials

Read from the environment only; never commit them or put them in a file in this repo.

| Variable | What it is |
|---|---|
| `YT_CLIENT_ID` | OAuth client id of a Google Cloud project with the YouTube Data API v3 and YouTube Analytics API enabled |
| `YT_CLIENT_SECRET` | That client's secret |
| `YT_REFRESH_TOKEN` | A refresh token for the channel owner's account, granted the `youtube.readonly` and `yt-analytics.readonly` scopes |

Status: the report logic and the request shapes are unit-tested (`pnpm test:checks`), but the
script has not yet been run against the live API. Expect to adjust on first real use.
