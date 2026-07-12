# Public-value classification by component — for discussion (2026-07-08)

> Basis: `docs/research/oss-landscape.md` (includes measured star counts). The decision is
> the user's — this document only proposes "what, why, and in what order" to release.

## Classification table

| Component | Classification | Rationale | Work needed to release |
|---|---|---|---|
| **draft** (vision-based rough cut) | **Top release candidate** | No prior OSS covers this. The biggest name in "agentic video editing," video-use (15.9k stars), states outright that it's "audio-first, doesn't work without dialogue" — this is exactly its complement. We hold measured counter-evidence that scene detection is useless for this footage | English README + a measured findings report (already in progress via the wiki's English conversion), split the knitting-specific assembly rules (cut-rhythm constants, etc.) out into config, decide on a name |
| **schema+render+bridge** (as a set) | Release candidate #2 | editly (5.4k stars) has been dormant for 14 months — there's an open slot for a modern successor to "zod contract + local ffmpeg + MCP editing" | Natural to bundle with draft in the same repo for release (no need to split distribution) |
| bridge alone | Write-up only | "Steer a document, not an app" — worth a blog/wiki post on its own; the code alone is too small a release | One write-up |
| **web** | **Keep private** | OpenCut (61.7k stars) already owns the general-purpose slot. Our web app's value is "bakes in the user's personal editing grammar," which has no meaning as a public release | — |
| voice profile (personal layer), editing-grammar constants | **Keep private (personal data)** | This is literally the user's speech patterns and editing habits — the voice now lives in the gitignored personal layer (`domains/*/voice.generated.md`, `transcripts/`), so it is already out of git | If released at all, share only the "how it was derived" methodology (the reverse-engineering wiki page already serves this role) |
| /episode, /goal commands | Gray area | The orchestration pattern is interesting, but it's tightly coupled to a personal environment | If released, as a pattern write-up |

## Proposed scenario (if release is decided on)

1. **Prerequisite**: convert the wiki to English (in progress) -> flipping the repo to
   public then becomes "a tool with an experiment report attached"
2. **Phase 1**: make this repo itself public (draft as the headline, schema/render/bridge as
   the foundation, web explicitly labeled "a personal-specialization example." Personal data
   like the voice profile is already in the gitignored personal layer
   (`domains/*/voice.generated.md`, `transcripts/`); confirm none leaked into committed theme
   files beforehand)
3. **Phase 2**: a positioning write-up for draft — "editing the video that video-use can't
   see" (Show HN, Reddit, etc.)
4. **Caution**: a privacy sweep is mandatory before release — media/ paths, family mentions,
   original filenames, and face-policy details are in the commit history ->
   **releasing with history intact is not an option; exporting to a fresh public repo is
   the safe path**

## Distribution model (decided 2026-07-09)

The tool is offered in layers — a stable machine surface first, AI layers on top:

```
Layer 3  docs for AI (AGENTS.md / llms.txt)   - explains the tool to agents
Layer 2  MCP tools (bridge)                   - lets agents operate it
Layer 1  CLI + library functions (--json)     - the stable machine surface
```

Consumption models, staged:

| Model | User experience | When |
|---|---|---|
| **A. Clone-and-own** (current) | Clone the repo, install, register MCP - live inside it. Fits the "fork a personal tool and make it yours" story (grammar config, voice profile as data) | Now - verified by the fresh-clone onboarding rehearsal |
| **B. npm-installed CLI** | `npx` the tools as dependencies; user's own folder holds cuesheets/config/voice profile | If public demand appears. Groundwork done: grammar config split, repo-relative paths, --json |
| **C. MCP-only** | Add one MCP server to any AI client; whole pipeline exposed as tools (scan/assemble/render) | Derivative of B, for AI-only users who never touch a CLI |

Decision: polish A now; hold B/C together with the npm-publish decision until there is
demand. The thresholds for B were deliberately lowered in advance.

## Open questions (need the user's decision)

- Do we even want to release publicly? (Portfolio value vs. keeping this a personal project)
- Release unit: the whole monorepo vs. draft as its own repo
- Timing: wait until the mistake/frog-it detection feature (backlog #1) lands, or release
  as-is now
