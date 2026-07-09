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
