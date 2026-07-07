interface Props {
  visible: boolean;
  onToggle: () => void;
}

const SHORTCUTS: Array<[string, string]> = [
  ["Space", "재생 / 정지"],
  ["L", "재생(연타 시 1x → 2x → 4x 배속)"],
  ["K", "정지"],
  ["J", "역재생(연타 시 1x → 2x → 4x 배속, 음소거)"],
  ["I / O", "현재 위치를 IN / OUT으로"],
  ["← / →", "1프레임 이동"],
  ["Shift + ← / →", "1초 이동"],
  ["↑ / ↓", "이전 / 다음 세그먼트 선택"],
  ["Tab / Shift+Tab", "다음 / 이전 세그먼트 (몰아쓰기 모드에선 입력창 이동)"],
  ["Cmd/Ctrl + B", "현재 위치에서 분할"],
  ["Cmd/Ctrl + J", "다음 컷과 합치기(인접한 같은 클립일 때만)"],
  ["?", "이 안내 접기/펼치기"],
];

/** 화면 구석에 접을 수 있는 단축키 안내. ? 키로도 토글된다(App.tsx의 전역 단축키). */
export function KeyboardHelp({ visible, onToggle }: Props) {
  return (
    <div className="keyboard-help">
      {visible ? (
        <ul className="keyboard-help-list">
          {SHORTCUTS.map(([key, desc]) => (
            <li key={key}>
              <kbd>{key}</kbd>
              <span>{desc}</span>
            </li>
          ))}
        </ul>
      ) : null}
      <button type="button" className="keyboard-help-toggle" onClick={onToggle}>
        단축키 {visible ? "접기" : "안내"}
      </button>
    </div>
  );
}
