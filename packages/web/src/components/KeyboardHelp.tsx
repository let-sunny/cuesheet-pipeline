import { Button } from "@astryxdesign/core/Button";

interface Props {
  visible: boolean;
  onToggle: () => void;
}

const SHORTCUTS: Array<[string, string]> = [
  ["Space", "재생 / 정지"],
  ["L", "재생(연타 시 1x → 2x → 4x 배속)"],
  ["K", "정지"],
  ["J", "역재생(연타 시 1x → 2x → 4x 배속, 음소거)"],
  ["I / O", "현재 위치를 구간 시작 / 끝으로"],
  ["← / →", "1프레임 이동"],
  ["Shift + ← / →", "1초 이동"],
  ["↑ / ↓", "이전 / 다음 컷 선택"],
  ["Tab / Shift+Tab", "다음 / 이전 컷 (몰아쓰기 모드에선 입력창 이동)"],
  ["Cmd/Ctrl + B", "현재 위치에서 분할"],
  ["Cmd/Ctrl + J", "다음 컷과 합치기(인접한 같은 클립일 때만)"],
  ["?", "이 안내 접기/펼치기"],
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
      <Button label="닫기" variant="ghost" size="sm" className="keyboard-help-toggle" onClick={onToggle} />
    </div>
  );
}
