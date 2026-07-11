import * as stylex from "@stylexjs/stylex";

/**
 * `Grid`'s `columns={{minWidth}}` responsive auto-fit is meant for card galleries (an unknown,
 * growing number of same-size items) - with exactly 2 fixed children (heading column, fields
 * column) in a section this wide, `repeat: "fill"` (Grid's default) computed 3 tracks fit the
 * container, left the 3rd empty, and starved both real columns down to ~360px each (measured via
 * a Playwright screenshot pass - see the Finish/Export step rebuild). A fixed template fixes both
 * problems at once: the heading column gets a sane, non-wasteful width instead of an even 50/50
 * split, and the fields column gets the rest. Collapses to a single column under 640px (matching
 * FormLayout's own horizontal-labels breakpoint) so this still behaves on a narrow viewport.
 */
export const styles = stylex.create({
  grid: {
    gridTemplateColumns: {
      default: "260px 1fr",
      "@media (max-width: 640px)": "1fr",
    },
  },
});
