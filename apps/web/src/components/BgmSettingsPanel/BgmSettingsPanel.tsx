import { useRef, useState } from "react";
import * as stylex from "@stylexjs/stylex";
import { Button } from "@astryxdesign/core/Button";
import { HStack } from "@astryxdesign/core/HStack";
import { Icon } from "@astryxdesign/core/Icon";
import { IconButton } from "@astryxdesign/core/IconButton";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import type { BgmCue } from "@cuesheet/schema";
import { bgmFileStreamUrl, type BgmFile } from "../../api.js";
import { useNumericField } from "../../hooks/useNumericField.js";
import { NumericInput } from "../ui/NumericInput/index.js";
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
 * gutter — same group/row/field visual rhythm as Cut settings (SegmentQuickFields), so the two
 * panels read as siblings rather than a bolted-on extra. Range is edited/shown in cut numbers
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
    void audio.play().catch(() => {});
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
    <VStack gap={1} paddingBlock={3} paddingInline={4} xstyle={styles.panel} data-testid="bgm-settings-panel">
      <Text type="label" weight="semibold" as="h2" xstyle={styles.panelTitle}>
        Background music track {bgmIndex + 1}
      </Text>

      {/* File - pre-listen before assigning: a play/stop button next to each candidate, separate
          from picking it, so auditioning doesn't require committing first. First group in this
          panel, so (unlike Range/Playback below) it never needs the dashed top separator. */}
      <VStack gap={1.5} data-testid="bgm-settings-group-file">
        <Text type="label" color="secondary" weight="semibold" xstyle={styles.groupLabel}>
          File
        </Text>
        <div {...stylex.props(styles.fileList)}>
          {files.length === 0 ? (
            <Text type="supporting" xstyle={styles.emptyNote}>
              {filesNote ?? "No audio files found under media/ or clipDir"}
            </Text>
          ) : (
            files.map((f) => {
              const isSelected = f.path === cue.file;
              const isPlaying = playingPath === f.path;
              return (
                <div
                  className={`bgm-file-row${isSelected ? " selected" : ""} ${stylex.props(styles.fileRow).className ?? ""}`}
                  key={f.path}
                >
                  {/* Stock Astryx IconButton/Button (2026-07-11 stock-component migration) replace
                      the old raw `.plain-button` pair. No stock "play" icon exists in Astryx's
                      icon registry, so the glyph stays a plain aria-hidden span (the accessible
                      name comes from `label`); "stop" is a registered icon name. */}
                  <IconButton
                    icon={isPlaying ? <Icon icon="stop" size="sm" /> : <span aria-hidden="true">▶</span>}
                    label={isPlaying ? "Stop preview" : "Preview"}
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      togglePreview(f.path);
                    }}
                  />
                  <Button
                    label={`${f.path}${f.durationS != null ? ` (${f.durationS.toFixed(1)}s)` : ""}`}
                    variant={isSelected ? "secondary" : "ghost"}
                    size="sm"
                    onClick={() => onChangeFile(f.path)}
                    xstyle={styles.fileNameButton}
                  />
                </div>
              );
            })
          )}
        </div>
        {cue.file !== "" && !currentFileKnown ? (
          <Text type="supporting" xstyle={styles.readonlyText}>
            Currently assigned: {cue.file}
          </Text>
        ) : null}
        {/* Hidden shared player driving each candidate's play/stop button above. */}
        <audio ref={audioRef} onEnded={() => setPlayingPath(null)} style={{ display: "none" }} />
      </VStack>

      {/* Range - anchored to cut numbers (the gutter's unit); seconds shown alongside since that's
          what's actually stored/rendered. */}
      <VStack gap={1.5} xstyle={styles.groupBorder} data-testid="bgm-settings-group-range">
        <Text type="label" color="secondary" weight="semibold" xstyle={styles.groupLabel}>
          Range
        </Text>
        <HStack gap={4} vAlign="center" wrap="wrap">
          <NumericInput field={startField} label="Start" testId="bgm-field-start" width={80} />
          <Text type="supporting">cut</Text>
          <NumericInput field={endField} label="End" testId="bgm-field-end" width={80} />
          <Text type="supporting">cut</Text>
        </HStack>
        <Text type="supporting" xstyle={styles.readonlyText}>
          Cuts {startCutIdx + 1}-{endCutIdx + 1} · {startSeconds.toFixed(1)}s-{endSeconds.toFixed(1)}s
        </Text>
      </VStack>

      <VStack gap={1.5} xstyle={styles.groupBorder} data-testid="bgm-settings-group-playback">
        <Text type="label" color="secondary" weight="semibold" xstyle={styles.groupLabel}>
          Playback
        </Text>
        <HStack gap={4} vAlign="center" wrap="wrap">
          <NumericInput field={volumeField} label="Volume" testId="bgm-field-volume" width={80} />
          <Text type="supporting">%</Text>
        </HStack>
      </VStack>

      <HStack justify="end" xstyle={styles.dangerZone}>
        <Button
          label="Remove track"
          variant="destructive"
          size="sm"
          onClick={onRemove}
          data-testid="bgm-action-remove"
        />
      </HStack>
    </VStack>
  );
}
