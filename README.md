# cuesheet-pipeline

A video editing pipeline that automatically assembles dialogue-free footage clips based on a cuesheet (JSON).

## Monorepo structure

```
packages/
  schema/   Cuesheet type definitions + runtime validation (single source of truth)  [implemented]
  web/      Web app for editing/previewing the cuesheet (produces the cuesheet)      [planned]
  render/   Takes a cuesheet and renders the final video, via ffmpeg etc. (consumes the cuesheet)  [planned]
```

### Data flow (who produces it, who consumes it)

```
  web  ──(cuesheet JSON)──▶  render  ──▶  final video.mp4
 edit/preview               render
```

The cuesheet is fully edited in the web app, and the resulting JSON is handed to the renderer to produce the final cut.

### Dependency direction (who imports whom)

```
  web  ──▶  schema  ◀──  render
```

- `schema` is the **contract** that both web and render import.
  Types and the zod schema are defined in one place so both sides share **the same rules**.
- The web app validates with `validateCueSheet` before saving, and the renderer validates again right before rendering.
  (Since it's the same schema, any cuesheet the web app passes is guaranteed to pass the renderer too.)
- `schema` doesn't depend on web/render → no cycles, the contract always stays at the center.
- Time units are in **seconds**. Frame conversion is handled by the render module via `fps`.
- Clip paths store **filename only**, with the folder kept separate as `clipDir` → moving the folder doesn't break things.

## Development

```bash
pnpm install
pnpm -r build      # build everything
pnpm -r typecheck  # type check
pnpm -r test       # tests
```
