import * as stylex from "@stylexjs/stylex";
import { HStack } from "@astryxdesign/core/HStack";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import type { NumericFieldBindings } from "../../hooks/useNumericField.js";
import { InlineField } from "../ui/InlineField/index.js";
import { styles } from "./PlaybackGroup.styles.js";

export interface PlaybackGroupProps {
  speedField: NumericFieldBindings;
  volumeField: NumericFieldBindings;
  /** Whether the cut's current speed is at the 16x cap (shows the browser-limit note). */
  speedAtCap: boolean;
}

/**
 * G2. Playback - Speed/Volume, paired on one row (screen-spec section 4). Speed is capped at 16x
 * (input min/max/step baked in here, matching the schema's own cap) - browsers throw a
 * NotSupportedError setting playbackRate above that, which would otherwise crash the preview.
 */
export function PlaybackGroup({ speedField, volumeField, speedAtCap }: PlaybackGroupProps) {
  return (
    <VStack gap={1.5} xstyle={styles.groupBorder} data-testid="cut-settings-group-playback">
      <Text type="label" color="secondary" weight="semibold" xstyle={styles.groupLabel}>
        Playback
      </Text>
      <HStack gap={4} vAlign="center" wrap="wrap">
        <InlineField label="Speed" inputID="cut-field-speed">
          <input
            id="cut-field-speed"
            type="number"
            min={0.1}
            max={16}
            step={0.1}
            title="Speed is capped at 16x - browsers can't play video faster than that"
            {...stylex.props(styles.plainField, styles.inputNarrow)}
            {...speedField}
            data-testid="cut-field-speed"
          />
        </InlineField>
        <Text type="supporting">x</Text>
        <InlineField label="Volume" inputID="cut-field-volume">
          <input
            id="cut-field-volume"
            type="number"
            min={0}
            max={100}
            step={1}
            {...stylex.props(styles.plainField, styles.inputNarrow)}
            {...volumeField}
            data-testid="cut-field-volume"
          />
        </InlineField>
        <Text type="supporting">%</Text>
      </HStack>
      {speedAtCap ? (
        <Text type="supporting" xstyle={styles.note}>
          Speed is capped at 16x - browsers can't play video faster than that.
        </Text>
      ) : null}
    </VStack>
  );
}
