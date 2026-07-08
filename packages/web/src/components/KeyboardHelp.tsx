import { Button } from "@astryxdesign/core/Button";

interface Props {
  visible: boolean;
  onToggle: () => void;
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

/**
 * 화면 구석에 뜨는 단축키 안내 패널. 여는/닫는 진입점은 헤더의 [?] 버튼과 ? 키
 * (App.tsx의 전역 단축키)이고, 이 컴포넌트는 패널 자체와 패널 안 [닫기]만 담당한다
 * (예전엔 이 컴포넌트가 자체 토글 버튼도 항상 떠 있게 그렸는데, 헤더에 [?]가 생기며
 * 같은 기능의 진입점이 두 곳이라 하나로 정리했다).
 */
export function KeyboardHelp({ visible, onToggle }: Props) {
  if (!visible) {
    return null;
  }
  return (
    <div className="keyboard-help">
      <ul className="keyboard-help-list">
        {SHORTCUTS.map(([key, desc]) => (
          <li key={key}>
            <kbd>{key}</kbd>
            <span>{desc}</span>
          </li>
        ))}
      </ul>
      <Button label="Close" variant="ghost" size="sm" className="keyboard-help-toggle" onClick={onToggle} />
    </div>
  );
}
