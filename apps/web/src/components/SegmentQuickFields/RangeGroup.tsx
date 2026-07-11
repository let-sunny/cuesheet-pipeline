import * as stylex from "@stylexjs/stylex";
import { HStack } from "@astryxdesign/core/HStack";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import type { NumericFieldBindings } from "../../hooks/useNumericField.js";
import { InlineField } from "../ui/InlineField/index.js";
import { styles } from "./RangeGroup.styles.js";

export interface RangeGroupProps {
  clip: string;
  lengthS: number;
  inField: NumericFieldBindings;
  outField: NumericFieldBindings;
  /** Schema's own "in must be less than out" message (with its swap hint when derivable) when
   * this cut's in/out is currently invalid - single-sourced from segmentRangeError so it never
   * drifts from what Save would report. null when in/out is currently valid. */
  rangeError: string | null;
  /** True when this is the first group rendered in its tab (Cut tab - Range is always first) -
   * skips the dashed top separator, matching the old shared-CSS first-child exception. */
  isFirst?: boolean;
}

/**
 * G1. Range - clip filename (read-only) + In/Out + computed Length (screen-spec section 4).
 * The clip filename is shown as read-only text only - the only proper way to change which source
 * clip a cut points to is picking a different scene from the Scenes palette or duplicating a cut,
 * so a free-text input was a bug magnet (a typo could easily point at a file that doesn't exist).
 * It still needs to be copyable (selectable), so it's a span, not a disabled input (disabled
 * inputs block selection in some browsers).
 */
export function RangeGroup({ clip, lengthS, inField, outField, rangeError, isFirst }: RangeGroupProps) {
  return (
    <VStack
      gap={1.5}
      xstyle={isFirst ? undefined : styles.groupBorder}
      data-testid="cut-settings-group-range"
    >
      <Text type="label" color="secondary" weight="semibold" xstyle={styles.groupLabel}>
        Range
      </Text>
      <HStack gap={1.5} vAlign="center">
        <Text type="supporting">clip</Text>
        {/* Text can't carry a native `title` attribute (BaseProps omits it in favor of Text's own
            truncation tooltip) - stays a plain styled span so hovering shows the full filename. */}
        <span {...stylex.props(styles.readonlyValue)} title={clip}>
          {clip}
        </span>
      </HStack>
      <HStack gap={4} vAlign="center" wrap="wrap">
        <InlineField label="In" inputID="cut-field-in">
          <input
            id="cut-field-in"
            // type="text", not "number" - a native number input sanitizes any value that isn't
            // plain float syntax back to "" (no leading "+", no ":"), which would silently eat the
            // M:SS.s shorthand and relative +/-n entry (trim-ux-conventions.md section 4.4) before
            // our own parser ever sees it. Up/Down frame-stepping is handled entirely in JS
            // (useNumericField's step/bigStep), so the native spinner isn't needed either.
            type="text"
            inputMode="decimal"
            {...stylex.props(styles.plainField, styles.inputNarrow)}
            {...inField}
            data-testid="cut-field-in"
          />
        </InlineField>
        <InlineField label="Out" inputID="cut-field-out">
          <input
            id="cut-field-out"
            type="text"
            inputMode="decimal"
            {...stylex.props(styles.plainField, styles.inputNarrow)}
            {...outField}
            data-testid="cut-field-out"
          />
        </InlineField>
        <Text
          type="supporting"
          xstyle={!!rangeError && styles.lengthErrorText}
          data-testid="cut-range-length"
        >
          Length {lengthS.toFixed(1)}s
        </Text>
      </HStack>
      {rangeError ? (
        <Text type="supporting" xstyle={styles.rangeError} role="alert" data-testid="cut-range-error">
          {rangeError}
        </Text>
      ) : null}
    </VStack>
  );
}
