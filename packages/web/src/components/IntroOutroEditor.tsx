import { useCallback, useEffect, useRef, useState } from "react";
import { Collapsible } from "@astryxdesign/core/Collapsible";
import { Button } from "@astryxdesign/core/Button";
import { baseName, INTRO_OUTRO_MAX_DURATION_S } from "../clipPaths.js";
import { fetchClipFiles, uploadClip, type ClipFile } from "../api.js";

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
    return `${f.name} (duration unknown)`;
  }
  const suffix = f.durationS > INTRO_OUTRO_MAX_DURATION_S ? " · over 15s (not selectable)" : "";
  return `${f.name} (${f.durationS.toFixed(1)}s)${suffix}`;
}

/**
 * intro/outro 지정 UI. clipDir 안 비디오 파일 목록을 서버(/api/clip-files)에서 받아
 * 셀렉트로 고르게 하고(15초 넘는 파일은 선택 불가로 비활성), clipDir 밖 경로나 특수
 * 케이스를 위한 직접 경로 입력은 접이식 섹션으로 유지한다. 선택/입력된 경로가 있으면
 * 인라인 video 미리보기 + 어느 클립인지 라벨 + [해제] 버튼도 보여준다.
 * intro/outro는 clipDir와 무관한 독립 파일 경로(schema 주석 참고).
 */
interface UploadState {
  uploading: boolean;
  progress: number;
  error: string | null;
}

const initialUploadState: UploadState = { uploading: false, progress: 0, error: null };

export function IntroOutroEditor({ intro, outro, clipDir, onChangeText, onSelectClip, onClear }: Props) {
  const [introError, setIntroError] = useState(false);
  const [outroError, setOutroError] = useState(false);
  const [files, setFiles] = useState<ClipFile[]>([]);
  const [filesNote, setFilesNote] = useState<string | undefined>(undefined);
  // clipDir 파일 목록은 파일마다 ffprobe로 길이를 재는 요청이라(수십 개면 1~2초+)
  // 응답 전엔 "파일 없음"과 구분되는 로딩 상태를 보여준다 — 안 그러면 잠깐이지만
  // clipDir이 실제로 비어있는 것처럼 보여 사용자가 오인할 수 있다.
  const [filesLoading, setFilesLoading] = useState(true);

  const [introUpload, setIntroUpload] = useState<UploadState>(initialUploadState);
  const [outroUpload, setOutroUpload] = useState<UploadState>(initialUploadState);
  const [introDragOver, setIntroDragOver] = useState(false);
  const [outroDragOver, setOutroDragOver] = useState(false);
  const introFileInputRef = useRef<HTMLInputElement>(null);
  const outroFileInputRef = useRef<HTMLInputElement>(null);

  const refreshFiles = useCallback(async () => {
    const result = await fetchClipFiles();
    setFiles(result.files);
    setFilesNote(result.note);
    setFilesLoading(false);
  }, []);

  useEffect(() => {
    setFilesLoading(true);
    void refreshFiles();
  }, [clipDir, refreshFiles]);

  // 파일 업로드 -> clipDir에 저장. 15초 상한을 넘으면(그리고 길이를 알 수 없지 않으면)
  // 배정하지 않고 에러만 보여준다 — 파일 자체는 clipDir에 남으므로 셀렉트 목록에는 뜨지만
  // (그 목록도 15초 초과면 선택 불가로 비활성화되므로) 안전하다.
  const handleFile = useCallback(
    async (role: "intro" | "outro", file: File) => {
      const setUpload = role === "intro" ? setIntroUpload : setOutroUpload;
      setUpload({ uploading: true, progress: 0, error: null });
      const result = await uploadClip(file, (pct) => {
        setUpload((prev) => ({ ...prev, progress: pct }));
      });
      if (!result.ok) {
        setUpload({ uploading: false, progress: 0, error: result.error });
        return;
      }
      await refreshFiles();
      if (result.durationS != null && result.durationS > INTRO_OUTRO_MAX_DURATION_S) {
        setUpload({
          uploading: false,
          progress: 0,
          error: `Uploaded file "${result.filename}" is ${result.durationS.toFixed(1)}s, over the ${INTRO_OUTRO_MAX_DURATION_S}s intro/outro limit - it was saved but not assigned. Pick a shorter file.`,
        });
        return;
      }
      setUpload({ uploading: false, progress: 0, error: null });
      onSelectClip(role, result.filename);
    },
    [onSelectClip, refreshFiles],
  );

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
        <h3>Intro</h3>
        {intro ? (
          <div className="intro-outro-current">
            <span className="intro-outro-clip-name">Clip: {clipLabel(intro, clipDir)}</span>
            <Button label="Clear" variant="ghost" size="sm" onClick={() => onClear("intro")} />
          </div>
        ) : null}
        <label className="settings-field wide-input">
          <span>Choose file</span>
          <select
            value={matchedIntroFile ?? ""}
            onChange={(e) => {
              if (e.target.value !== "") {
                onSelectClip("intro", e.target.value);
              }
            }}
          >
            <option value="">
              {filesLoading ? "Loading…" : files.length === 0 ? "(no files in clipDir)" : "Select…"}
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
        <div
          className={`intro-outro-dropzone${introDragOver ? " intro-outro-dropzone-active" : ""}`}
          onDragOver={(e) => {
            e.preventDefault();
            setIntroDragOver(true);
          }}
          onDragLeave={() => setIntroDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIntroDragOver(false);
            const file = e.dataTransfer.files[0];
            if (file) {
              void handleFile("intro", file);
            }
          }}
        >
          <input
            ref={introFileInputRef}
            type="file"
            accept="video/*"
            className="intro-outro-file-input"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) {
                void handleFile("intro", file);
              }
            }}
          />
          <Button
            label={introUpload.uploading ? `Uploading… ${introUpload.progress}%` : "Upload file"}
            variant="secondary"
            size="sm"
            isDisabled={introUpload.uploading}
            isLoading={introUpload.uploading}
            onClick={() => introFileInputRef.current?.click()}
          />
          <span className="intro-outro-dropzone-hint">or drag and drop a video file here</span>
          {introUpload.error ? <p className="intro-outro-upload-error">{introUpload.error}</p> : null}
        </div>
        <Collapsible trigger="Enter path manually" defaultIsOpen={!matchedIntroFile && intro != null}>
          <label className="settings-field wide-input">
            <span>Path</span>
            <input
              type="text"
              value={intro ?? ""}
              placeholder="Leave empty for none"
              onChange={(e) => onChangeText({ intro: e.target.value === "" ? null : e.target.value })}
            />
          </label>
        </Collapsible>
        {intro ? (
          introError ? (
            <div className="empty intro-outro-missing">Can't find the source: {intro}</div>
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
        <h3>Outro</h3>
        {outro ? (
          <div className="intro-outro-current">
            <span className="intro-outro-clip-name">Clip: {clipLabel(outro, clipDir)}</span>
            <Button label="Clear" variant="ghost" size="sm" onClick={() => onClear("outro")} />
          </div>
        ) : null}
        <label className="settings-field wide-input">
          <span>Choose file</span>
          <select
            value={matchedOutroFile ?? ""}
            onChange={(e) => {
              if (e.target.value !== "") {
                onSelectClip("outro", e.target.value);
              }
            }}
          >
            <option value="">
              {filesLoading ? "Loading…" : files.length === 0 ? "(no files in clipDir)" : "Select…"}
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
        <div
          className={`intro-outro-dropzone${outroDragOver ? " intro-outro-dropzone-active" : ""}`}
          onDragOver={(e) => {
            e.preventDefault();
            setOutroDragOver(true);
          }}
          onDragLeave={() => setOutroDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOutroDragOver(false);
            const file = e.dataTransfer.files[0];
            if (file) {
              void handleFile("outro", file);
            }
          }}
        >
          <input
            ref={outroFileInputRef}
            type="file"
            accept="video/*"
            className="intro-outro-file-input"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) {
                void handleFile("outro", file);
              }
            }}
          />
          <Button
            label={outroUpload.uploading ? `Uploading… ${outroUpload.progress}%` : "Upload file"}
            variant="secondary"
            size="sm"
            isDisabled={outroUpload.uploading}
            isLoading={outroUpload.uploading}
            onClick={() => outroFileInputRef.current?.click()}
          />
          <span className="intro-outro-dropzone-hint">or drag and drop a video file here</span>
          {outroUpload.error ? <p className="intro-outro-upload-error">{outroUpload.error}</p> : null}
        </div>
        <Collapsible trigger="Enter path manually" defaultIsOpen={!matchedOutroFile && outro != null}>
          <label className="settings-field wide-input">
            <span>Path</span>
            <input
              type="text"
              value={outro ?? ""}
              placeholder="Leave empty for none"
              onChange={(e) => onChangeText({ outro: e.target.value === "" ? null : e.target.value })}
            />
          </label>
        </Collapsible>
        {outro ? (
          outroError ? (
            <div className="empty intro-outro-missing">Can't find the source: {outro}</div>
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
