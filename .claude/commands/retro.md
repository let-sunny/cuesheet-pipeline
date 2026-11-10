---
description: Pull the YouTube retro (first N days per upload) and file it into the personal wiki
argument-hint: [days, default 8]
---

1. Run `pnpm retro --days ${ARGUMENTS:-8} --out /tmp/retro.md --dump /tmp/retro-raw.json`. If it
   reports missing credentials, stop and point the user at `scripts/analytics/README.md` - never
   ask for the secrets in chat.
2. Read the report. Compare the newest video's suggested-feed pickup against the others.
3. If a personal wiki is set up for this channel (sibling repo, see `/plan-episode`), save the
   report into its `raw/` folder as `<date>-youtube-retro.md` and follow that wiki's ingest
   procedure. Report what changed since the previous retro rather than restating the table.
4. Impressions and click-through rate are not in this report; say so instead of inferring them.
