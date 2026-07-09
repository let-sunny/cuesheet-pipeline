import { useRef, useState } from "react";
import * as stylex from "@stylexjs/stylex";
import { Button } from "@astryxdesign/core/Button";
import type { BgmCue } from "@cuesheet/schema";
import { bgmFileStreamUrl, type BgmFile } from "../../api.js";
import { useNumericField } from "../../hooks/useNumericField.js";
import { styles } from "./BgmSettingsPanel.styles.js";

interface Props {
  cue: BgmCue;
  bgmIndex: number;
  startCutIdx: number;
  endCutIdx: number;
  startSeconds: number;
  endSeconds: number;
  cutCount: number;
  files: BgmFile[];
  filesNote: string | undefined;
  onChangeFile: (path: string) => void;
  onChangeRange: (startCutIdx: number, endCutIdx: number) => void;
  onChangeVolume: (volume: number) => void;
  onRemove: () => void;
}

/**
 * Right-column panel shown in the Edit step when a BGM track (not a cut) is selected in the
 * gutter — same qf-group/qf-row/qf-field grid tokens as Cut settings (SegmentQuickFields), so the
 * two panels read as siblings rather than a bolted-on extra. Range is edited/shown in cut numbers
 * (the gutter's anchor unit) alongside the seconds they resolve to; storage stays seconds
 * (converted by the caller via lib/bgmCutMapping.ts) - no schema change.
 */
export function BgmSettingsPanel({
  cue,
  bgmIndex,
  startCutIdx,
  endCutIdx,
  startSeconds,
  endSeconds,
  cutCount,
  files,
  filesNote,
  onChangeFile,
  onChangeRange,
  onChangeVolume,
  onRemove,
}: Props) {
  const [playingPath, setPlayingPath] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  const togglePreview = (path: string) => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }
    if (playingPath === path) {
      audio.pause();
      setPlayingPath(null);
      return;
    }
    audio.src = bgmFileStreamUrl(path);
    void audio.play();
    setPlayingPath(path);
  };

  const currentFileKnown = cue.file !== "" && files.some((f) => f.path === cue.file);

  const startField = useNumericField({
    value: startCutIdx + 1,
    coerce: (n) => Math.min(endCutIdx + 1, Math.max(1, Math.round(n))),
    onCommit: (next) => onChangeRange(next - 1, endCutIdx),
  });
  const endField = useNumericField({
    value: endCutIdx + 1,
    coerce: (n) => Math.max(startCutIdx + 1, Math.min(cutCount, Math.round(n))),
    onCommit: (next) => onChangeRange(startCutIdx, next - 1),
  });
  const volumeField = useNumericField({
    value: Math.round(cue.volume * 100),
    coerce: (n) => Math.min(100, Math.max(0, Math.round(n))),
    onCommit: (next) => onChangeVolume(next / 100),
  });

  return (
    <div className="quick-fields" data-testid="bgm-settings-panel">
      <h2 className="qf-panel-title">Background music track {bgmIndex + 1}</h2>

      {/* File - pre-listen before assigning: a play/stop button next to each candidate, separate
          from picking it, so auditioning doesn't require committing first. */}
      <div className="qf-group" data-testid="bgm-settings-group-file">
        <div className="qf-group-label">File</div>
        <div {...stylex.props(styles.fileList)}>
          {files.length === 0 ? (
            <p className="narration-empty-note">{filesNote ?? "No audio files found under media/ or clipDir"}</p>
          ) : (
            files.map((f) => (
              <div
                className={`bgm-file-row${f.path === cue.file ? " selected" : ""} ${stylex.props(styles.fileRow).className ?? ""}`}
                key={f.path}
              >
                <button
                  type="button"
                  className="plain-button bgm-file-play"
                  onClick={(e) => {
                    e.stopPropagation();
                    togglePreview(f.path);
                  }}
                  title={playingPath === f.path ? "Stop preview" : "Preview"}
                >
                  {playingPath === f.path ? "■" : "▶"}
                </button>
                <button type="button" className="plain-button bgm-file-name" onClick={() => onChangeFile(f.path)}>
                  {f.path}
                  {f.durationS != null ? ` (${f.durationS.toFixed(1)}s)` : ""}
                </button>
              </div>
            ))
          )}
        </div>
        {cue.file !== "" && !currentFileKnown ? <p className="qf-readonly">Currently assigned: {cue.file}</p> : null}
        {/* Hidden shared player driving each candidate's play/stop button above. */}
        <audio ref={audioRef} onEnded={() => setPlayingPath(null)} style={{ display: "none" }} />
      </div>

      {/* Range - anchored to cut numbers (the gutter's unit); seconds shown alongside since that's
          what's actually stored/rendered. */}
      <div className="qf-group" data-testid="bgm-settings-group-range">
        <div className="qf-group-label">Range</div>
        <div className="qf-row">
          <label className="qf-field field-narrow">
            <span>Start</span>
            <input
              type="number"
              className="plain-field"
              min={1}
              max={endCutIdx + 1}
              {...startField}
              data-testid="bgm-field-start"
            />
            <span className="qf-suffix">cut</span>
          </label>
          <label className="qf-field field-narrow">
            <span>End</span>
            <input
              type="number"
              className="plain-field"
              min={startCutIdx + 1}
              max={cutCount}
              {...endField}
              data-testid="bgm-field-end"
            />
            <span className="qf-suffix">cut</span>
          </label>
        </div>
        <span className="qf-readonly">
          Cuts {startCutIdx + 1}-{endCutIdx + 1} · {startSeconds.toFixed(1)}s-{endSeconds.toFixed(1)}s
        </span>
      </div>

      <div className="qf-group" data-testid="bgm-settings-group-playback">
        <div className="qf-group-label">Playback</div>
        <div className="qf-row">
          <label className="qf-field field-narrow">
            <span>Volume</span>
            <input
              type="number"
              className="plain-field"
              min={0}
              max={100}
              step={1}
              {...volumeField}
              data-testid="bgm-field-volume"
            />
            <span className="qf-suffix">%</span>
          </label>
        </div>
      </div>

      <div className="qf-danger-zone">
        <Button
          label="Remove track"
          variant="destructive"
          size="sm"
          onClick={onRemove}
          data-testid="bgm-action-remove"
        />
      </div>
    </div>
  );
}
