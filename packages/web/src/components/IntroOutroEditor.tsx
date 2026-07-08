import { useCallback, useEffect, useRef, useState } from "react";
import { Collapsible } from "@astryxdesign/core/Collapsible";
import { Button } from "@astryxdesign/core/Button";
import { baseName, INTRO_OUTRO_MAX_DURATION_S } from "../clipPaths.js";
import { fetchClipFiles, uploadClip, type ClipFile } from "../api.js";

interface Props {
  intro: string | null;
  outro: string | null;
  clipDir: string;
  /** Direct path input (text field) — coalesced into a single undo entry while typing. */
  onChangeText: (patch: { intro?: string | null; outro?: string | null }) => void;
  /** When picking a file within clipDir from the select — a discrete edit recorded as a single undo entry immediately. */
  onSelectClip: (role: "intro" | "outro", clipFileName: string) => void;
  /** The [Clear] button — a discrete edit recorded as a single undo entry immediately. */
  onClear: (role: "intro" | "outro") => void;
}

interface UploadState {
  uploading: boolean;
  progress: number;
  error: string | null;
}

/**
 * The intro/outro assignment UI. Fetches the list of video files in clipDir from the server
 * (/api/clip-files) and lets the user pick one via a select (files over 15s are disabled and
 * unselectable), while keeping a direct path input in a collapsible section for paths outside
 * clipDir or special cases. If a path is selected/entered, it also shows an inline video
 * preview + a "which clip" label + a [Clear] button.
 * intro/outro are independent file paths unrelated to clipDir (see the schema comment).
 */
export function IntroOutroEditor({ intro, outro, clipDir, onChangeText, onSelectClip, onClear }: Props) {
  const [introError, setIntroError] = useState(false);
  const [outroError, setOutroError] = useState(false);
  const [files, setFiles] = useState<ClipFile[]>([]);
  const [filesNote, setFilesNote] = useState<string | undefined>(undefined);
  // The clipDir file list request runs ffprobe on every file to measure its duration (1-2s+ for
  // dozens of files), so before the response arrives we show a loading state distinct from "no
  // files" — otherwise clipDir would briefly look like it's actually empty, which could mislead the user.
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

  // File upload -> saved to clipDir. If it exceeds the 15s cap (and its duration is known),
  // don't assign it, just show an error — the file itself stays in clipDir so it still shows up
  // in the select list (which is safe since that list also disables selection past 15s).
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

  // Clear the previous error state whenever the path changes (whether from direct edits or a
  // fresh load) - same pattern as VideoPreview's missing state.
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
            className="plain-field"
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
              className="plain-field"
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
            className="plain-field"
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
              className="plain-field"
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

function localVideoUrl(path: string): string {
  return `/api/local-video?path=${encodeURIComponent(path)}`;
}

/** If it's a clip under clipDir, show just the filename as the "which clip" label; otherwise use the path as-is. */
function clipLabel(path: string, clipDir: string): string {
  const normalizedDir = clipDir.replace(/\/+$/, "");
  return path.startsWith(`${normalizedDir}/`) ? baseName(path) : path;
}

/** Returns the filename if the intro/outro path matches a file in clipDir's file list, otherwise undefined. */
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

const initialUploadState: UploadState = { uploading: false, progress: 0, error: null };
