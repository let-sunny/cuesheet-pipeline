# Styling migration recipe

> 2026-07-09. `styles.css` is ~2000 lines, mostly per-feature classes predating the "component
> layering" rule (CLAUDE.md). `TitleOverlay/` was the first component built with full anatomy
> from scratch; `StepNav/` is the first existing component *migrated* into that shape. This doc
> is the template for migrating the rest, one component at a time.

## Target shape

```
components/<Name>/
  <Name>.tsx          # component, role header at top
  <Name>.styles.ts     # stylex.create() — every static rule the component owns
  <Name>.test.tsx      # co-located tests (render, interaction, conditional branches)
  index.ts             # export gate (component + its exported types/helpers only)
```

Same anatomy as `components/TitleOverlay/`. Plain CSS in `styles.css` survives only as the
tokens/base file (color variables, reset) and the explicit marker classes for the 4
domain-custom areas (timeline, crop overlay, palette cards, video stage — screen-spec section 0-6).

## Order of operations

1. **Find every rule the component owns.** `grep` `styles.css` for the component's class names
   (its root class and any classes only it renders). Don't assume there's something to move —
   `StepNav` turned up zero rules (it was already a pure Astryx composition of `TabList`/`Tab`/
   `Badge`, no bespoke class at all). When that happens, still create `<Name>.styles.ts` with an
   empty `stylex.create({})` and a comment saying so — keeps the anatomy uniform, and gives the
   next static tweak an obvious home instead of a new ad hoc `styles.css` rule.
2. **Create the folder and move the component file in.** Update its own internal imports
   (relative paths gain one more `../`) and every external import site (`grep -rn` the old
   path — components import via `./components/<Name>.js` or `./components/<Name>/index.js`
   depending on whether it already had a folder).
3. **Port the CSS rules into `<Name>.styles.ts`.** See conversion patterns below.
4. **Replace `className="foo"` with `{...stylex.props(styles.foo)}`** in the JSX (pattern below),
   keeping any dynamic/conditional `style={{...}}` as plain inline style — StyleX only owns the
   static half (screen-spec rule 8: `xstyle`/stylex for static, `style` for dynamic/conditional).
5. **Delete the now-dead rules from `styles.css`.** Grep again afterward for the old class names
   repo-wide — a rule that's still referenced anywhere means the migration isn't done.
6. **Write/port the test file**, exercising the branches that used to only be checkable by eye
   (conditional classes, selected/unselected states, badge content).
7. **Add the `index.ts` barrel** (component + any exported types/pure helpers the component
   file exports — mirror `TitleOverlay/index.ts`).
8. **Verify** — typecheck + test, then a screenshot diff (below).

## className -> stylex.props conversion patterns

**Plain static class:**
```tsx
// before
<div className="thumb-empty" />
// styles.css: .thumb-empty { width: 100%; height: 100%; background: var(--stage-bg); }

// after
import { styles } from "./Name.styles.js";
<div {...stylex.props(styles.thumbEmpty)} />
// Name.styles.ts
export const styles = stylex.create({
  thumbEmpty: { width: "100%", height: "100%", backgroundColor: "var(--stage-bg)" },
});
```

**Conditional variant (was `` `base${cond ? " modifier" : ""}` ``):**
```tsx
// before
<div className={`card${inUse ? " in-use" : ""}`} />

// after — stylex.props accepts multiple args and falsy ones are skipped, so the
// conditional collapses to a boolean expression instead of a string template
<div {...stylex.props(styles.card, inUse && styles.cardInUse)} />
```

**Multiple independent modifiers (was several appended class names):**
```tsx
// before
<div className={`card${a ? " a" : ""}${b ? " b" : ""}`} />

// after — list them in the same call, order matters exactly like CSS source order
// (last-applied-wins on overlapping properties)
<div {...stylex.props(styles.card, a && styles.cardA, b && styles.cardB)} />
```

**Static + dynamic mixed** (e.g. a fixed layout rule plus a per-frame computed opacity):
```tsx
<div {...stylex.props(styles.backdrop)} style={{ opacity: dimOpacity }} />
```
The static shape (`position`, `inset`, etc.) goes in `styles.ts`; the per-render numeric value
stays a plain inline `style` — see `TitleOverlay.tsx` line 32 for the reference instance.

**Marker classes that must stay plain CSS** (domain-custom areas, screen-spec rule 6): leave the
`className="plain-button"`/`.moment-*` etc. as-is — these are explicitly exempted, not a
migration target.

## Verification

1. `pnpm typecheck` and `pnpm test` (or `pnpm -r` from repo root) — must stay green; the
   co-located test file should cover every conditional branch removed from eyeballing.
2. **Screenshot diff, same viewport, both themes**: capture the component before the migration
   (previous build/commit) and after, light and dark, and compare pixel-for-pixel. Any visual
   diff must be explained (e.g. a genuine, separately-requested change) — a migration alone
   should produce zero visual diff, since it only changes *where* the CSS lives, not what it
   computes to.

## Precedent

- `components/TitleOverlay/` — anatomy for a component built from scratch.
- `components/StepNav/` — anatomy for a component migrated from a flat `.tsx` file with no
  existing CSS to move (the degenerate but valid case: empty `.styles.ts`, the value is the
  folder/test/index scaffolding and import-path change, not CSS extraction).

---

## Appendix: styles.css residue map (2026-07-09)

A complete classification of all 1910 lines in `apps/web/src/styles.css` into six categories, identifying what remains, why, and the migration path forward.

### Classification table

| Category | Lines | Description | Status |
|----------|-------|-------------|--------|
| **(a) Tokens/Base** | 1–148 | `:root` color tokens (custom + Astryx theme overrides), `html` color-scheme rules, `body` styling, Astryx theme bug workarounds (lines 99–120) | **Keep in styles.css** (contract file) |
| **(b) Plain-* marker** | 263–306 | `.plain-button`, `.plain-field`, `.plain-field-textarea` (raw-element guards against specificity collisions with Astryx components) | **Keep in styles.css** (screen-spec rule 8) |
| **(c) Shared tokens** | 391–550 | `.settings-*`, `.field-narrow/medium/full`, `.segment-field`, `.settings-note`, `.settings-group` (used by 2+ components: FinishingSettings, IntroOutroEditor, ProjectMetaFields, RenderSettingsDialog, etc.) | **Keep in styles.css** (shared layout vocabulary) |
| **(d) Domain-custom** | 559–796, 798–880, 909–1125, 1140–1210, 1377–1433, 1742–1910 | Video stage (`.video-*`, `.crop-edit-*`), timeline (`.scrub-*`, `.trim-*`), palette grid (`.moment-*`), mini strip (`.mini-strip-*`), BGM gutter (`.bgm-*`), sequence player (`.sequence-*`). These form the app's core editing interface — visual "stages" with complex overlay/canvas behavior. | **Keep until component anatomy folders are created** (see trade-off note below) |
| **(e) Documented exceptions** | 99–120, 308–343, 1283–1320, 1377–1414 | Cascade/specificity ties that can't migrate to StyleX without visual regression (explained in each rule's comment). Examples: HeaderBar theme toggle (`.theme-mode-toggle button`), CompactSegmentList subtitle input (`.compact-list-subtitle-input`), BgmSettingsPanel file buttons (`.bgm-file-*`). | **Keep in styles.css** (documented, measured for regressions) |
| **(f) Migratable remainder** | ~240 lines (see list below) | Single-component-owned rules with no marker-class ties or specificity hazards. Small, isolated stylings ready for component `.styles.ts` homes. | **Batch 4+ candidates** (migrate in next iteration) |

### Category (d) domain-custom visuals — composition

These are not error/exception cases but rather **intentional design**: the app's editing interface consists of 6 visual "stages" (video frame, timeline strip, palette grid, sequence playback, crop tool, BGM track). Each is a complex interactive canvas with overlays, handles, and visual feedback. They share timeline language (`.scrub-*`, `.trim-*`) and are tightly coupled to rendering logic.

**Line ranges:**
- **Video stage + crop overlay** (lines 559–796): `.video-preview`, `.video-context-*`, `.video-crop-frame`, `.crop-edit-*` — VideoPreview + CropEditOverlay (238 lines)
- **Timeline scrubbing** (lines 798–880): `.scrub-*`, `.trim-overview*`, `.time-readout` — shared across Edit step (82 lines)
- **Moment palette grid** (lines 909–1125): `.moment-palette`, `.moment-card*`, `.moment-grid`, `.moment-*`, `.empty-state` — MomentPalette (217 lines)
- **Mini timeline strip** (lines 1140–1210): `.mini-strip-*` — MiniTimelineStrip (71 lines)
- **BGM track gutter** (lines 1377–1433): `.bgm-gutter-*`, `.bgm-file-*` — CompactSegmentList BGM section (57 lines, documented exception at lines 1377–1388)
- **Sequential playback** (lines 1742–1910): `.sequence-*` — SequencePlayer (169 lines)

**Current state:** All owned by unmigrated components (VideoPreview, CropEditOverlay, MomentPalette, MiniTimelineStrip, SequencePlayer, CompactSegmentList BGM gutter).

### Category (f) migratable remainder — batch 4+ candidates

Single-component rules, no marker-class ties, ready to move to component `.styles.ts` files:

| Component | Classes | Lines | Notes |
|-----------|---------|-------|-------|
| App (root) | `.app`, `.app h2` | ~13 | Top-level padding/layout — safe to move to App.styles.ts |
| Banner | `.banner`, `.banner-actions`, `.banner.success/error`, `.banner.error ul/pre` | ~46 | Generic success/error alert — candidate for standalone Banner component or FinishingSettings.styles.ts |
| Video controls | `.notice`, `.playmode-toggle`, `.playmode-toggle button.active`, `.time-readout`, `.video-controls-row` | ~30 | Small controls in VideoPreview — defer until VideoPreview migrates |
| Segment list | `.timeline`, `.segment`, `.segment.selected`, `.segment .clip`, `.segment .meta`, `.segment .subtitle`, `.empty` | ~53 | Generic segment list styling — could move to a SegmentList component or stay as base (not yet claimed by VideoPreview) |
| Swatch | `.swatch` | ~8 | Color indicator — move to a Swatch subcomponent or color-field component |
| Edit layout | `.edit-layout`, `.trim-layout`, `.trim-workspace`, `.trim-video-col`, `.trim-fields-col` | ~57 | Edit step container layout — could be EditLayout.styles.ts (a layout-only shell component) |
| Segment thumbnail | `.segment-thumb`, `.segment-thumb img` | ~10 | Shared thumbnail — move to SegmentThumb.styles.ts (currently used by CompactSegmentList, VideoPreview) |
| **Subtotal (f)** | | ~217 | |

### Defined END STATE

**styles.css keeps only (a) + (b) + (c) + (e):**
- **(a)** `:root` color tokens, theme rules, body
- **(b)** `.plain-button`, `.plain-field` marker classes (raw-element guards)
- **(c)** `.settings-*`, `.field-*` shared layout tokens (used by 2+ components for form layout)
- **(e)** Documented cascade exceptions (HeaderBar, CompactSegmentList, BgmSettingsPanel, Astryx theme bug fixes)

**Total: ~370 lines** (tokens + markers + shared + exceptions)

**Domain-custom visuals (d) — migration trade-off:**
The 6 visual stages are intentionally kept in plain CSS because they represent a distinct "editing interface layer" with complex canvas/overlay behavior. Migrating them to component `.styles.ts` files is technically possible but requires:
1. Each component (VideoPreview, MomentPalette, etc.) to have a full anatomy folder structure (`.tsx`, `.styles.ts`, `.test.tsx`, `index.ts`)
2. A decision on whether secondary components like CropEditOverlay become sub-styles within VideoPreview.styles.ts or standalone

**Recommendation:** Defer domain-custom visual migration until the component team has capacity for full-lifecycle testing (visual screenshots, accessibility, responsive behavior). The current plain-CSS organization is maintainable and low-risk for incremental refinement. When ready, migrate one stage at a time (VideoPreview first, then MiniTimelineStrip, etc.).

**Batch 4+ priority order:**
1. **Category (f)** — batch 4: Migrate 12 small migratable components (App, Banner, Segment list, Edit layout, etc.) — ~217 lines, low risk
2. **Category (d)** — batch 5+: Migrate VideoPreview + CropEditOverlay (~238 lines), then MomentPalette (~217), MiniTimelineStrip (~71), SequencePlayer (~169)
3. **Remaining** — Category (d) BGM gutter is already documented as an exception in CompactSegmentList.styles.ts; keep its plain-CSS stub unless CompactSegmentList refactor necessitates absorption



> Batch 4 (2026-07-09): complete — category (f) migrated or deleted-as-dead; styles.css at 1745 lines. Remaining: category (d) domain-custom (batch 5, deferred) + documented exceptions.

> Batch 5 (2026-07-10): complete — the deferred category (d) domain-custom remainder. VideoPreview,
> CropEditOverlay, SequencePlayer, MomentPalette, and MiniTimelineStrip all migrated to full
> component anatomy (folder + `.styles.ts` + co-located test + `index.ts`); App.tsx's own
> `.mini-strip-row`/`.sequence-player-sticky`/`.step-body` container rules folded into
> App.styles.ts alongside its existing `.app` rule. CropEditOverlay was given its own standalone
> anatomy folder (not nested inside VideoPreview) — same precedent as TrimStrip/SegmentThumb, both
> single-consumer components that still get their own folder.
>
> New documented exceptions discovered during this batch (same root cause each time — a descendant
> selector or same-specificity override beats `.plain-button`/`.plain-field`, which StyleX's
> injected-before-styles.css output can't replicate): `.playmode-toggle button.active`
> (VideoPreview), `.moment-filters button`(+`.active`) (MomentPalette), `.mini-strip-block`
> (+`.selected`/`.clip-boundary`, base properties too — not just an `.active` variant, see
> MiniTimelineStrip.styles.ts's comment) and `.mini-strip-zoom-controls button` (MiniTimelineStrip),
> `.sequence-player-speed-toggle button`(+`.active`) (SequencePlayer). `.video-subtitle-overlay`
> (+ position/text variants) stays shared plain CSS — confirmed used by VideoPreview.tsx *and*
> SubtitleStyleSettings.tsx *and* SubtitleStylePresetsSettings.tsx (deliberately identical preview
> CSS), not owned by any single component. `.moment-palette.status` (MomentPalette's loading/error
> message, itself composed from the shared `.status` class + a component-specific override) is
> fully absorbed into MomentPalette.styles.ts's own `paletteStatus` instead, since it no longer
> needs the shared class at all. A few dead marker classes with no CSS rule at all turned up along
> the way (`.crop-edit-readout`, `.moment-duration`, `.moment-status-filters`, `.sequence-video`'s
> `.visible` modifier) — left as-is in the JSX (harmless, out of scope for a pure styling move).
>
> **Final state**: styles.css at 1110 lines (down from 1745 after batch 4). This is above the
> original ~370-line residue-map projection from the 2026-07-09 audit — that number predates batch
> 5 and only ever counted categories (a)+(b)+(c)+(e) as then understood; the newly-documented
> exceptions above (discovered only once the domain-custom components actually got their anatomy
> folders) plus category (c) shared layout tokens (never in scope for batch 4/5) account for the
> gap. All of it is now classified (shared token, documented specificity exception, or tokens/base)
> — nothing left is an unexamined leftover.
>
> Verification: `pnpm --filter @cuesheet/web test` (56 files / 441 tests), `pnpm -r typecheck`,
> `pnpm e2e` (12/12) all green; visual regression screenshots (Edit step with a cut selected,
> Finish step, Compose step, Play all/SequencePlayer — 1280x800, light + dark) matched the
> pre-migration baseline pixel-for-pixel (chrome only differs by the live playhead timestamp and
> whichever theme-toggle button is active, both expected).
