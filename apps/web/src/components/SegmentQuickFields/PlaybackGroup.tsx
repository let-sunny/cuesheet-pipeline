import { HStack } from "@astryxdesign/core/HStack";
import { Icon } from "@astryxdesign/core/Icon";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { Percent } from "lucide-react";
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
      {/* nowrap keeps Speed and Volume paired on ONE row (screen-spec intent). With wrap allowed,
          their labels ("Speed"/"Volume") + unit suffixes are wider than In/Out's, so at the
          13-inch width the pair overflowed and the "Volume" label orphaned onto a second line from
          its input (QA 2026-07-11). A narrower field width (numbers here are 1-3 chars: speed
          0.1-16, volume 0-100) plus nowrap fits both on one line without regressing In/Out. */}
      <HStack gap={3} vAlign="center" wrap="nowrap">
        {/* No labelTooltip here (unlike some other NumericInput call sites) - Astryx's tooltip
            content mounts in the DOM unconditionally (shown/hidden only via CSS), which would
            make the "capped at 16x" text always findable and defeat the conditional `note` below
            that shows it only once the cut is actually at the cap. The conditional note is the
            one meaningful surface for this; a passive always-on hover hint isn't worth that
            conflict. */}
        <NumericInput field={speedField} label="Speed" testId="cut-field-speed" width={60} />
        <NumericInput field={volumeField} label="Volume" testId="cut-field-volume" width={60} />
        {/* Volume unit - the Percent icon (the field's "Volume" label already carries the meaning,
            so the icon is a decorative unit marker). */}
        <Icon icon={Percent} size="sm" color="secondary" />
      </HStack>
      {speedAtCap ? (
        <Text type="supporting" xstyle={styles.note}>
          Speed is capped at 16x - browsers can't play video faster than that.
        </Text>
      ) : null}
    </VStack>
  );
}
