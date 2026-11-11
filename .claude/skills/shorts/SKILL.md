---
name: shorts
description: Plan and render vertical Shorts from an episode's existing moments.json
argument-hint: <episode slug under media/drafts/>
---

Shorts are a by-product of an episode that has already been through `/episode` - never a new
vision pass. Input: `$ARGUMENTS` = the episode slug (the folder under `media/drafts/`).

1. Confirm `media/drafts/<slug>/moments.json` exists. If not, stop and say `/episode` has to run
   first.
2. Plan only (no encode yet):

   ```bash
   pnpm --filter @cuesheet/draft exec cuesheet-draft shorts \
     --moments media/drafts/<slug>/moments.json \
     --clip-dir "<raw footage folder>" \
     --out-dir media/drafts/<slug>/shorts
   ```

3. Show the user each planned Short (hook + cut list) and look at one frame per hero cut to
   confirm it is face-safe and has no bare feet - the plan trusts `moments.json`, which may
   predate a policy.
4. After the user picks which to keep, rerun with `--render` (and `--max` if fewer are wanted).
5. If a personal wiki is set up for this channel, read its title and Shorts pages and propose a
   title per rendered Short. Never upload; the user publishes.
