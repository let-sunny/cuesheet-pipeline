import { useEffect, useState } from "react";
import { baseName } from "../clipPaths.js";

interface Props {
  intro: string | null;
  outro: string | null;
  clipDir: string;
  /** 경로 직접 입력(텍스트 필드) — 타이핑 중 연속 편집으로 묶인다. */
  onChangeText: (patch: { intro?: string | null; outro?: string | null }) => void;
  /** [해제] 버튼 — 즉시 1개 언두 항목으로 기록되는 개별 편집이다. */
  onClear: (role: "intro" | "outro") => void;
}

function localVideoUrl(path: string): string {
  return `/api/local-video?path=${encodeURIComponent(path)}`;
}

/** clipDir 밑의 클립이면 파일명만 "어느 클립인지" 라벨로 보여주고, 아니면 경로를 그대로 쓴다. */
function clipLabel(path: string, clipDir: string): string {
  const normalizedDir = clipDir.replace(/\/+$/, "");
  return path.startsWith(`${normalizedDir}/`) ? baseName(path) : path;
}

/**
 * intro/outro 파일 경로 입력(비우면 null) + 경로가 있으면 인라인 video 미리보기 +
 * 어느 클립인지 라벨 + [해제] 버튼. 팔레트 카드/편집 인스펙터에서 지정한 경우에도
 * 여기 즉시 반영된다(같은 draft 상태를 보므로).
 * intro/outro는 clipDir와 무관한 독립 파일 경로(schema 주석 참고).
 */
export function IntroOutroEditor({ intro, outro, clipDir, onChangeText, onClear }: Props) {
  const [introError, setIntroError] = useState(false);
  const [outroError, setOutroError] = useState(false);

  // 경로가 바뀌면(직접 수정이든 새로 로드든) 이전 에러 상태를 지운다 -
  // VideoPreview의 missing 패턴과 동일.
  useEffect(() => {
    setIntroError(false);
  }, [intro]);

  useEffect(() => {
    setOutroError(false);
  }, [outro]);

  return (
    <div className="intro-outro-editor">
      <div className="settings-group">
        <h3>인트로</h3>
        {intro ? (
          <div className="intro-outro-current">
            <span className="intro-outro-clip-name">클립: {clipLabel(intro, clipDir)}</span>
            <button
              type="button"
              className="intro-outro-clear-button"
              onClick={() => onClear("intro")}
            >
              해제
            </button>
          </div>
        ) : null}
        <label className="settings-field wide-input">
          <span>경로</span>
          <input
            type="text"
            value={intro ?? ""}
            placeholder="비우면 없음"
            onChange={(e) => onChangeText({ intro: e.target.value === "" ? null : e.target.value })}
          />
        </label>
        {intro ? (
          introError ? (
            <div className="empty intro-outro-missing">파일을 찾을 수 없습니다: {intro}</div>
          ) : (
            <video
              className="intro-outro-preview"
              src={localVideoUrl(intro)}
              controls
              onError={() => setIntroError(true)}
            />
          )
        ) : null}
      </div>

      <div className="settings-group">
        <h3>아웃트로</h3>
        {outro ? (
          <div className="intro-outro-current">
            <span className="intro-outro-clip-name">클립: {clipLabel(outro, clipDir)}</span>
            <button
              type="button"
              className="intro-outro-clear-button"
              onClick={() => onClear("outro")}
            >
              해제
            </button>
          </div>
        ) : null}
        <label className="settings-field wide-input">
          <span>경로</span>
          <input
            type="text"
            value={outro ?? ""}
            placeholder="비우면 없음"
            onChange={(e) => onChangeText({ outro: e.target.value === "" ? null : e.target.value })}
          />
        </label>
        {outro ? (
          outroError ? (
            <div className="empty intro-outro-missing">파일을 찾을 수 없습니다: {outro}</div>
          ) : (
            <video
              className="intro-outro-preview"
              src={localVideoUrl(outro)}
              controls
              onError={() => setOutroError(true)}
            />
          )
        ) : null}
      </div>
    </div>
  );
}
