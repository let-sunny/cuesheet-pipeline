import * as stylex from "@stylexjs/stylex";
import { Button } from "@astryxdesign/core/Button";
import { styles } from "./KeyboardHelp.styles.js";

interface Props {
  visible: boolean;
  onToggle: () => void;
}

/**
 * The keyboard shortcuts help panel that appears in a corner of the screen. The open/close
 * entry points are the header's [?] button and the ? key (a global shortcut in App.tsx); this
 * component is only responsible for the panel itself and the [Close] button inside it (this
 * component used to always render its own toggle button too, but once [?] was added to the
 * header, having two entry points for the same feature was consolidated into one).
 */
export function KeyboardHelp({ visible, onToggle }: Props) {
  if (!visible) {
    return null;
  }
  return (
    <div {...stylex.props(styles.panel)}>
      <p {...stylex.props(styles.note)}>Playback/trim shortcuts (Space, L/K/J, I/O, arrows, Cmd+B) apply on the ② Edit step.</p>
      <ul {...stylex.props(styles.list)}>
        {SHORTCUTS.map(([key, desc]) => (
          <li key={key} {...stylex.props(styles.listItem)}>
            <kbd {...stylex.props(styles.kbd)}>{key}</kbd>
            <span>{desc}</span>
          </li>
        ))}
      </ul>
      <Button label="Close" variant="ghost" size="sm" xstyle={styles.toggle} onClick={onToggle} />
    </div>
  );
}

const SHORTCUTS: Array<[string, string]> = [
  ["Space", "Play / pause"],
  ["L", "Play (tap repeatedly for 1x -> 2x -> 4x speed)"],
  ["K", "Stop"],
  ["J", "Reverse play (tap repeatedly for 1x -> 2x -> 4x speed, muted)"],
  ["I / O", "Set current position as range In / Out"],
  ["← / →", "Move 1 frame"],
  ["Shift + ← / →", "Move 1 second"],
  ["↑ / ↓", "Select previous / next cut"],
  ["Tab / Shift+Tab", "Next / previous cut (moves between fields in write mode)"],
  ["Cmd/Ctrl + B", "Split at current position"],
  ["Cmd/Ctrl + J", "Merge with next cut (only when adjacent and same clip)"],
  ["?", "Toggle this help panel"],
];
