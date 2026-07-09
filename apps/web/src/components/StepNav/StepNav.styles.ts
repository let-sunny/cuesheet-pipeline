import * as stylex from "@stylexjs/stylex";

/**
 * Component anatomy exemplar (migration variant — see docs/styling-migration.md): co-located
 * stylex.create() file, same as a from-scratch component (TitleOverlay). StepNav was picked as
 * the first migration target for exactly this reason — small, stable, visible on every screen —
 * but auditing styles.css turned up zero rules scoped to it (no `.step-nav`/`.tab-list` class, no
 * bare-tag styling): it was already a pure Astryx composition (`TabList`/`Tab`/`Badge`), so there
 * is nothing to move out. This file stays as an intentionally empty placeholder rather than being
 * skipped, so the anatomy (folder + .tsx + .styles.ts + .test.tsx + index.ts) is uniform across
 * every migrated component — the moment StepNav needs its own static tweak (an `xstyle` per
 * screen-spec rule 8), it has an obvious, already-wired home instead of a new ad hoc styles.css rule.
 */
export const styles = stylex.create({});
