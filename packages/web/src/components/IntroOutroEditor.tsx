import { useEffect, useState } from "react";
import { Collapsible } from "@astryxdesign/core/Collapsible";
import { Button } from "@astryxdesign/core/Button";
import { baseName, INTRO_OUTRO_MAX_DURATION_S } from "../clipPaths.js";
import { fetchClipFiles, type ClipFile } from "../api.js";

interface Props {
  intro: string | null;
  outro: string | null;
  clipDir: string;
  /** 경로 직접 입력(텍스트 필드) — 타이핑 중 연속 편집으로 묶인다. */
  onChangeText: (patch: { intro?: string | null; outro?: string | null }) => void;
  /** clipDir 안 파일을 셀렉트에서 골랐을 때 — 즉시 1개 언두 항목으로 기록되는 개별 편집이다. */
  onSelectClip: (role: "intro" | "outro", clipFileName: string) => void;
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

/** intro/outro 경로가 clipDir 안의 파일 목록에 있는 파일과 일치하면 그 파일명을, 아니면 undefined를 반환한다. */
function matchedFileName(path: string | null, clipDir: string, files: ClipFile[]): string | undefined {
  if (!path) {
    return undefined;
  }
  const label = clipLabel(path, clipDir);
  return files.some((f) => f.name === label) ? label : undefined;
}

function optionLabel(f: ClipFile): string {
  if (f.durationS == null) {
    return `${f.name} (길이 확인 불가)`;
  }
  const suffix = f.durationS > INTRO_OUTRO_MAX_DURATION_S ? " · 15초 초과(선택 불가)" : "";
  return `${f.name} (${f.durationS.toFixed(1)}s)${suffix}`;
}

/**
 * intro/outro 지정 UI. clipDir 안 비디오 파일 목록을 서버(/api/clip-files)에서 받아
 * 셀렉트로 고르게 하고(15초 넘는 파일은 선택 불가로 비활성), clipDir 밖 경로나 특수
 * 케이스를 위한 직접 경로 입력은 접이식 섹션으로 유지한다. 선택/입력된 경로가 있으면
 * 인라인 video 미리보기 + 어느 클립인지 라벨 + [해제] 버튼도 보여준다.
 * intro/outro는 clipDir와 무관한 독립 파일 경로(schema 주석 참고).
 */
export function IntroOutroEditor({ intro, outro, clipDir, onChangeText, onSelectClip, onClear }: Props) {
  const [introError, setIntroError] = useState(false);
  const [outroError, setOutroError] = useState(false);
  const [files, setFiles] = useState<ClipFile[]>([]);
  const [filesNote, setFilesNote] = useState<string | undefined>(undefined);
  // clipDir 파일 목록은 파일마다 ffprobe로 길이를 재는 요청이라(수십 개면 1~2초+)
  // 응답 전엔 "파일 없음"과 구분되는 로딩 상태를 보여준다 — 안 그러면 잠깐이지만
  // clipDir이 실제로 비어있는 것처럼 보여 사용자가 오인할 수 있다.
  const [filesLoading, setFilesLoading] = useState(true);

  useEffect(() => {
    setFilesLoading(true);
    void (async () => {
      const result = await fetchClipFiles();
      setFiles(result.files);
      setFilesNote(result.note);
      setFilesLoading(false);
    })();
  }, [clipDir]);

  // 경로가 바뀌면(직접 수정이든 새로 로드든) 이전 에러 상태를 지운다 -
  // VideoPreview의 missing 패턴과 동일.
  useEffect(() => {
    setIntroError(false);
  }, [intro]);

  useEffect(() => {
    setOutroError(false);
  }, [outro]);

  const matchedIntroFile = matchedFileName(intro, clipDir, files);
  const matchedOutroFile = matchedFileName(outro, clipDir, files);

  return (
    <div className="intro-outro-editor">
      <div className="settings-group">
        <h3>인트로</h3>
        {intro ? (
          <div className="intro-outro-current">
            <span className="intro-outro-clip-name">클립: {clipLabel(intro, clipDir)}</span>
            <Button label="해제" variant="ghost" size="sm" onClick={() => onClear("intro")} />
          </div>
        ) : null}
        <label className="settings-field wide-input">
          <span>파일 선택</span>
          <select
            value={matchedIntroFile ?? ""}
            onChange={(e) => {
              if (e.target.value !== "") {
                onSelectClip("intro", e.target.value);
              }
            }}
          >
            <option value="">
              {filesLoading ? "불러오는 중…" : files.length === 0 ? "(clipDir에 파일 없음)" : "선택하세요"}
            </option>
            {files.map((f) => (
              <option key={f.name} value={f.name} disabled={f.durationS == null || f.durationS > INTRO_OUTRO_MAX_DURATION_S}>
                {optionLabel(f)}
              </option>
            ))}
          </select>
        </label>
        {!filesLoading && files.length === 0 && filesNote ? (
          <p className="narration-empty-note">{filesNote}</p>
        ) : null}
        <Collapsible trigger="직접 경로 입력" defaultIsOpen={!matchedIntroFile && intro != null}>
          <label className="settings-field wide-input">
            <span>경로</span>
            <input
              type="text"
              value={intro ?? ""}
              placeholder="비우면 없음"
              onChange={(e) => onChangeText({ intro: e.target.value === "" ? null : e.target.value })}
            />
          </label>
        </Collapsible>
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
            <Button label="해제" variant="ghost" size="sm" onClick={() => onClear("outro")} />
          </div>
        ) : null}
        <label className="settings-field wide-input">
          <span>파일 선택</span>
          <select
            value={matchedOutroFile ?? ""}
            onChange={(e) => {
              if (e.target.value !== "") {
                onSelectClip("outro", e.target.value);
              }
            }}
          >
            <option value="">
              {filesLoading ? "불러오는 중…" : files.length === 0 ? "(clipDir에 파일 없음)" : "선택하세요"}
            </option>
            {files.map((f) => (
              <option key={f.name} value={f.name} disabled={f.durationS == null || f.durationS > INTRO_OUTRO_MAX_DURATION_S}>
                {optionLabel(f)}
              </option>
            ))}
          </select>
        </label>
        {!filesLoading && files.length === 0 && filesNote ? (
          <p className="narration-empty-note">{filesNote}</p>
        ) : null}
        <Collapsible trigger="직접 경로 입력" defaultIsOpen={!matchedOutroFile && outro != null}>
          <label className="settings-field wide-input">
            <span>경로</span>
            <input
              type="text"
              value={outro ?? ""}
              placeholder="비우면 없음"
              onChange={(e) => onChangeText({ outro: e.target.value === "" ? null : e.target.value })}
            />
          </label>
        </Collapsible>
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
