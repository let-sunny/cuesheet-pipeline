import * as stylex from "@stylexjs/stylex";
import { textSizeVars } from "@astryxdesign/core/theme/tokens.stylex";
import { Tab } from "@astryxdesign/core/TabList";
import type { TabProps } from "@astryxdesign/core/TabList";

const styles = stylex.create({
  small: {
    fontSize: textSizeVars["--font-size-sm"],
  },
});

/**
 * Role: an Astryx Tab with its label font pinned to a small token, for the app's navigational tab
 * rows (StepNav's step tabs, the cut-settings Cut|Effects tabs) — Tab's own `size` prop only scales
 * the tab's height/padding, not its font (fixed at `--text-label-size` internally), so those rows
 * kept reading as body-size text even at `size="sm"` (2026-07-11 typography pass, design-
 * principles.md #6 "dense, 13-inch"). Same API as Tab — this wrapper only adds the small xstyle on
 * top. Promoted straight to a wrapper (CLAUDE.md "component layering": 2+ call sites) since both
 * StepNav and SegmentQuickFields needed the identical override.
 */
export function NavTab(props: TabProps) {
  const { xstyle, ...rest } = props;
  return <Tab {...rest} xstyle={[styles.small, xstyle]} />;
}
