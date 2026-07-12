import { useRef, useState } from "react";
import * as stylex from "@stylexjs/stylex";
import { Button } from "@astryxdesign/core/Button";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { Icon } from "@astryxdesign/core/Icon";
import { IconButton } from "@astryxdesign/core/IconButton";
import { Text } from "@astryxdesign/core/Text";
import type { BgmCue } from "@cuesheet/schema";
import { bgmFileStreamUrl, type BgmFile } from "../../api.js";
import { useNumericField } from "../../hooks/useNumericField.js";
import { NumericInput } from "../ui/NumericInput/index.js";
import { SelectField } from "../ui/SelectField/index.js";
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
  onClose: () => void;
}

/**
 * Horizontal property bar shown at the TOP of the Edit step when a BGM track (not a cut) is
 * selected in the gutter (2026-07-12 user decision). It is a SEPARATE layer from the right-hand Cut
 * settings column, which always stays SegmentQuickFields now - selecting a BGM track no longer
 * swaps that column out. Mirrors CapCut/Premiere's "selected-element properties bar": the track's
 * controls (File, Volume, Range, Remove) laid out in a wrapping row, with a Close (X) that
 * deselects the track. Range is edited in cut numbers (the gutter's anchor unit) alongside the
 * seconds they resolve to; storage stays seconds (converted by the caller via lib/bgmCutMapping.ts)
 * - no schema change. File is a dropdown (not the old scrolling candidate list) since a full-width
 * top bar has no room for a vertical list; a single preview button auditions the selected file.
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
  onClose,
}: Props) {
  const [previewing, setPreviewing] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);

  const currentFileKnown = cue.file !== "" && files.some((f) => f.path === cue.file);

  const togglePreview = () => {
    const audio = audioRef.current;
    if (!audio || cue.file === "") {
      return;
    }
    if (previewing) {
      audio.pause();
      setPreviewing(false);
      return;
    }
    audio.src = bgmFileStreamUrl(cue.file);
    void audio.play().catch(() => {});
    setPreviewing(true);
  };

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

  // The Selector's value must match one of its options: prepend an explicit choice when the
  // assigned file is unset ("") or isn't among the discovered files (the "(none)" pattern
  // SelectField documents).
  const fileOptions = files.map((f) => ({
    value: f.path,
    label: `${f.path}${f.durationS != null ? ` (${f.durationS.toFixed(1)}s)` : ""}`,
  }));
  if (cue.file === "") {
    fileOptions.unshift({ value: "", label: "Select a file" });
  } else if (!currentFileKnown) {
    fileOptions.unshift({ value: cue.file, label: `Currently: ${cue.file}` });
  }

  return (
    <div {...stylex.props(styles.bar)} data-testid="bgm-settings-panel">
      <HStack vAlign="center" gap={2} xstyle={styles.header}>
        <Heading level={2} xstyle={styles.panelTitle}>
          Background music track {bgmIndex + 1}
        </Heading>
        <div {...stylex.props(styles.spacer)} />
        <IconButton
          icon={<Icon icon="close" size="sm" />}
          label="Close background music settings"
          tooltip="Close"
          variant="ghost"
          size="sm"
          onClick={onClose}
          data-testid="bgm-action-close"
        />
      </HStack>

      <HStack vAlign="center" gap={4} wrap="wrap" xstyle={styles.controls}>
        {files.length === 0 ? (
          <Text type="supporting" xstyle={styles.emptyNote}>
            {filesNote ?? "No audio files found under media/ or clipDir"}
          </Text>
        ) : (
          <HStack vAlign="center" gap={1}>
            <SelectField
              label="File"
              value={cue.file}
              options={fileOptions}
              onChange={onChangeFile}
              testId="bgm-field-file"
              width={200}
            />
            {/* No stock "play" icon in Astryx's registry, so the glyph stays a plain aria-hidden
                span (the accessible name comes from `label`); "stop" is a registered icon name. */}
            <IconButton
              icon={previewing ? <Icon icon="stop" size="sm" /> : <span aria-hidden="true">▶</span>}
              label={previewing ? "Stop preview" : "Preview"}
              tooltip={previewing ? "Stop preview" : "Preview"}
              variant="ghost"
              size="sm"
              isDisabled={cue.file === ""}
              onClick={togglePreview}
              data-testid="bgm-action-preview"
            />
          </HStack>
        )}

        <NumericInput field={volumeField} label="Volume" testId="bgm-field-volume" width={64} units="%" />

        {/* Range in cut numbers (the gutter's anchor unit); the seconds they resolve to are shown
            alongside since that's what's actually stored/rendered. */}
        <HStack vAlign="center" gap={1}>
          <NumericInput field={startField} label="Cuts" testId="bgm-field-start" width={56} />
          <Text type="supporting" aria-hidden="true">
            →
          </Text>
          <NumericInput field={endField} label="End" testId="bgm-field-end" width={56} />
        </HStack>
        <Text type="supporting" xstyle={styles.readonlyText}>
          {startSeconds.toFixed(1)}s-{endSeconds.toFixed(1)}s
        </Text>

        <div {...stylex.props(styles.spacer)} />

        <Button
          label="Remove track"
          variant="destructive"
          size="sm"
          onClick={onRemove}
          data-testid="bgm-action-remove"
        />
      </HStack>

      {/* Hidden shared player driving the preview button above. */}
      <audio ref={audioRef} onEnded={() => setPreviewing(false)} style={{ display: "none" }} />
    </div>
  );
}
