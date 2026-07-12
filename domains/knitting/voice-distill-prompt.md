# Knitting domain — voice distillation prompt

How the operating session turns a person's own past subtitles into their subtitle-voice profile.
This is the **theme scaffold** (committed, shareable — no individual's voice lives here); the voice
itself is the **personal layer** (`transcripts/`, `voice.generated.md`), which is gitignored. A
person adopting the knitting theme drops their transcripts in and distills their own voice; the
original author's voice does not ship with the theme.

Same no-API pattern as the vision pass: the session (Claude) reads the transcripts and writes the
profile directly — no external model call, no added cost.

## Inputs

- `domains/knitting/transcripts/*` — the person's past subtitle sets / dialogue, one file per source
  (plain text or `.srt` — subtitle copy is what matters, timestamps are ignored). Personal,
  gitignored. If the directory is empty or missing, skip distillation and leave any existing
  `voice.generated.md` in place.

## Output — `domains/knitting/voice.generated.md`

A self-contained, portable style prompt (paste-into-a-prompt shape): a source-corpus note, a
core-voice summary, sentence-ending conversion rules with their frequency, a signature-vocabulary
dictionary, structural grammar (intro/outro/stage-directions/memes), a prohibited list, and a few
observation-memo -> subtitle few-shot pairs. Write it in the working language (Korean) — it is
generated working content, not a translation target — so it is gitignored and never leaves the repo.

### Caching header (decision S2: generate-once, invalidate on transcript change)

Distillation is not re-run every episode. `voice.generated.md` opens with a machine-readable header
stamping exactly which transcripts it was distilled from:

```
<!-- voice.generated.md — distilled from transcripts. Do not hand-edit; edit transcripts and re-distill.
sources:
  - <filename>  sha256:<first-12-hex-of-content-hash>
  - ...
-->
```

Before the subtitle pass, compare the current `transcripts/*` (filenames + content hashes) against
this header. **Re-distill only if they differ** (a transcript was added, removed, or edited);
otherwise reuse the cached profile as-is. This keeps the voice stable across runs and cheap.

## Distillation rules

- Extract the **voice**, never the **content**: the sentence endings, rhythm, vocabulary tone, and
  structural habits — not the specific sentences. The profile's few-shot examples illustrate tone on
  invented memos; they are reference-only and must never be reused verbatim in a real episode.
- Measure the sentence-ending conversion **frequency** from the corpus (e.g. what fraction of `~요`
  endings are twisted to `~여`) and state it as a ratio — over-converting reads as fake.
- Capture per-channel fixed conventions verbatim as rules (for knitting: cats are always written
  "고앵이", the reveal "짜잔" family, the closing "안녕~~").
- Keep every length/format constraint the render path imposes: single line, ~25 chars (max 40), no
  emoji beyond jamo (ㅜㅜ/ㅎㅎ).
