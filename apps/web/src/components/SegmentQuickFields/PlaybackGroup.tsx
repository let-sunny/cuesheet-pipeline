import { HStack } from "@astryxdesign/core/HStack";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import type { NumericFieldBindings } from "../../hooks/useNumericField.js";
import { NumericInput } from "../ui/NumericInput/index.js";
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
        {/* No labelTooltip here (unlike some other NumericInput call sites) - Astryx's tooltip
            content mounts in the DOM unconditionally (shown/hidden only via CSS), which would
            make the "capped at 16x" text always findable and defeat the conditional `note` below
            that shows it only once the cut is actually at the cap. The conditional note is the
            one meaningful surface for this; a passive always-on hover hint isn't worth that
            conflict. */}
        <NumericInput field={speedField} label="Speed" testId="cut-field-speed" width={80} />
        <Text type="supporting">x</Text>
        <NumericInput field={volumeField} label="Volume" testId="cut-field-volume" width={80} />
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
