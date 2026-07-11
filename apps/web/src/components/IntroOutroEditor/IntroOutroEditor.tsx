import { useCallback, useEffect, useRef, useState } from "react";
import * as stylex from "@stylexjs/stylex";
import { Collapsible } from "@astryxdesign/core/Collapsible";
import { Button } from "@astryxdesign/core/Button";
import { Field } from "@astryxdesign/core/Field";
import { Grid } from "@astryxdesign/core/Grid";
import { Heading } from "@astryxdesign/core/Heading";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { VStack } from "@astryxdesign/core/VStack";
import { baseName, INTRO_OUTRO_MAX_DURATION_S } from "../../clipPaths.js";
import { fetchClipFiles, uploadClip, type ClipFile } from "../../api.js";
import {
  classifyVideoSourceError,
  videoSourceErrorMessage,
  type VideoSourceErrorKind,
} from "../../lib/videoSourceError.js";
import { styles } from "./IntroOutroEditor.styles.js";

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
 * The intro/outro assignment UI - a two-up `Grid` (Intro | Outro), the density target the rest of
 * the Finish step's sections follow (docs/design-principles.md). Fetches the list of video files
 * in clipDir from the server (/api/clip-files) and lets the user pick one via a select (files over
 * 15s are disabled and unselectable), while keeping a direct path input (`TextInput`, in a
 * Collapsible) for paths outside clipDir or special cases. If a path is selected/entered, it also
 * shows an inline video preview + a "which clip" label + a [Clear] button.
 * intro/outro are independent file paths unrelated to clipDir (see the schema comment).
 */
export function IntroOutroEditor({ intro, outro, clipDir, onChangeText, onSelectClip, onClear }: Props) {
  // null = no error. Distinguishes a missing source (fetch 404) from a file that exists but isn't
  // playable video (QA finding 2026-07-10) - see lib/videoSourceError.ts for why this needs a
  // supplementary fetch rather than the <video> error event's own MediaError.code.
  const [introErrorKind, setIntroErrorKind] = useState<VideoSourceErrorKind | null>(null);
  const [outroErrorKind, setOutroErrorKind] = useState<VideoSourceErrorKind | null>(null);
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
    setIntroErrorKind(null);
  }, [intro]);

  useEffect(() => {
    setOutroErrorKind(null);
  }, [outro]);

  // The <video> error event's own MediaError.code can't distinguish "file doesn't exist" from
  // "file exists but isn't playable video" (verified empirically - see lib/videoSourceError.ts) -
  // a supplementary fetch of the same src is what actually tells the two apart.
  const handleVideoError = useCallback((src: string, setKind: (kind: VideoSourceErrorKind) => void) => {
    void fetch(src, { method: "HEAD" })
      .then((res) => setKind(classifyVideoSourceError(res.ok)))
      .catch(() => setKind("missing"));
  }, []);

  const matchedIntroFile = matchedFileName(intro, clipDir, files);
  const matchedOutroFile = matchedFileName(outro, clipDir, files);

  return (
    // Fixed 2-column grid (not the responsive minWidth API) - with exactly 2 children, minWidth's
    // auto-fill/auto-fit math can add a phantom 3rd track on a wide section and starve both real
    // columns (measured via a Playwright screenshot pass on FinishSettingsSection's own heading|
    // fields grid, same root cause) - a fixed count sidesteps that entirely. `xstyle={styles.grid}`
    // additionally overrides the track template to `minmax(0, 1fr)` (2026-07-11 overflow fix,
    // finish-and-count-diagnosis.md) - Grid's own `columns={2}` template defaults each track to
    // `minmax(auto, 1fr)`, whose `auto` minimum equals the widest child's min-content width; the
    // "Choose file" select's longest option text (a filename + duration + "over 15s" suffix)
    // measured wider than the fields column's available width, so without an explicit 0 minimum
    // the whole Grid (and the page) was forced 208px wider than the 1280px viewport.
    <Grid columns={2} gap={6} xstyle={styles.grid}>
      <VStack gap={3}>
        <Heading level={4}>Intro</Heading>
        {intro ? (
          <div {...stylex.props(styles.current)}>
            <span {...stylex.props(styles.clipName)}>Clip: {clipLabel(intro, clipDir)}</span>
            <Button label="Clear" variant="ghost" size="sm" onClick={() => onClear("intro")} />
          </div>
        ) : null}
        {/* The file list is dynamic (server-fetched) with per-item disabled options (over the
            duration cap) and a loading placeholder - kept as a native <select> wrapped in Field
            rather than swapped to Astryx's Selector (2026-07-11 stock-audit completion pass,
            re-verified against Selector's own docs/dist source): Selector is a popover/combobox
            whose option list only renders (as ARIA `role="option"` elements, not native
            `<option>`s with a real `.disabled` property) once the popover is open, not a drop-in
            replacement for this native `<select>` - IntroOutroEditor.test.tsx's own
            "disables select options for files over the intro/outro duration cap" case asserts
            exactly that (`HTMLOptionElement`s, `.disabled`), so swapping would break real,
            intentional test coverage of the disabled-option behavior, not just cosmetics. Flagged
            as a follow-up if a Selector-based rewrite (re-deriving that test around an opened
            popover + aria-disabled) is ever worth the behavioral risk. */}
        <Field label="Choose file" inputID="intro-file-select" width="100%">
          <select
            id="intro-file-select"
            {...stylex.props(styles.select)}
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
        </Field>
        {!filesLoading && files.length === 0 && filesNote ? (
          <Text type="supporting" color="secondary">
            {filesNote}
          </Text>
        ) : null}
        <div
          {...stylex.props(styles.dropzone, introDragOver && styles.dropzoneActive)}
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
            {...stylex.props(styles.fileInput)}
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
          <span {...stylex.props(styles.dropzoneHint)}>or drag and drop a video file here</span>
          {introUpload.error ? <p {...stylex.props(styles.uploadError)}>{introUpload.error}</p> : null}
        </div>
        <Collapsible trigger={<Text type="label">Enter path manually</Text>} defaultIsOpen={!matchedIntroFile && intro != null}>
          <TextInput
            label="Path"
            value={intro ?? ""}
            placeholder="Leave empty for none"
            onChange={(value) => onChangeText({ intro: value === "" ? null : value })}
          />
        </Collapsible>
        {intro ? (
          introErrorKind ? (
            <div {...stylex.props(styles.missing)}>
              {videoSourceErrorMessage(introErrorKind, intro)}
            </div>
          ) : (
            <video
              {...stylex.props(styles.preview)}
              src={localVideoUrl(intro)}
              controls
              onError={(e) => handleVideoError(e.currentTarget.currentSrc || e.currentTarget.src, setIntroErrorKind)}
            />
          )
        ) : null}
      </VStack>

      <VStack gap={3}>
        <Heading level={4}>Outro</Heading>
        {outro ? (
          <div {...stylex.props(styles.current)}>
            <span {...stylex.props(styles.clipName)}>Clip: {clipLabel(outro, clipDir)}</span>
            <Button label="Clear" variant="ghost" size="sm" onClick={() => onClear("outro")} />
          </div>
        ) : null}
        <Field label="Choose file" inputID="outro-file-select" width="100%">
          <select
            id="outro-file-select"
            {...stylex.props(styles.select)}
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
        </Field>
        {!filesLoading && files.length === 0 && filesNote ? (
          <Text type="supporting" color="secondary">
            {filesNote}
          </Text>
        ) : null}
        <div
          {...stylex.props(styles.dropzone, outroDragOver && styles.dropzoneActive)}
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
            {...stylex.props(styles.fileInput)}
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
          <span {...stylex.props(styles.dropzoneHint)}>or drag and drop a video file here</span>
          {outroUpload.error ? <p {...stylex.props(styles.uploadError)}>{outroUpload.error}</p> : null}
        </div>
        <Collapsible trigger={<Text type="label">Enter path manually</Text>} defaultIsOpen={!matchedOutroFile && outro != null}>
          <TextInput
            label="Path"
            value={outro ?? ""}
            placeholder="Leave empty for none"
            onChange={(value) => onChangeText({ outro: value === "" ? null : value })}
          />
        </Collapsible>
        {outro ? (
          outroErrorKind ? (
            <div {...stylex.props(styles.missing)}>
              {videoSourceErrorMessage(outroErrorKind, outro)}
            </div>
          ) : (
            <video
              {...stylex.props(styles.preview)}
              src={localVideoUrl(outro)}
              controls
              onError={(e) => handleVideoError(e.currentTarget.currentSrc || e.currentTarget.src, setOutroErrorKind)}
            />
          )
        ) : null}
      </VStack>
    </Grid>
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
