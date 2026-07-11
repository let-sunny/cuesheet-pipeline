import { FormLayoutContext } from "@astryxdesign/core/FormLayout";
import { TextInput, type TextInputStatus } from "@astryxdesign/core/TextInput";
import type { NumericFieldBindings } from "../../../hooks/useNumericField.js";
import { styles } from "./NumericInput.styles.js";

export interface NumericInputProps {
  /** Binds `useNumericField`'s transient-text/commit contract straight to a stock Astryx
   * `TextInput` (type="text", not `NumberInput` - see useNumericField.ts's file comment:
   * NumberInput sanitizes non-numeric keystrokes, which would eat the hook's M:SS.s shorthand and
   * relative +/-n entry before its own parser ever sees it). */
  field: NumericFieldBindings;
  label: string;
  /** data-testid on the real `<input>` (TextInput forwards it via BaseProps + `...rest`). */
  testId?: string;
  /** Narrows the input's own bordered box (px, or any CSS width value) - e.g. 80 for Cut
   * settings' In/Out/Speed/Volume. Omit to let it size naturally. */
  width?: number | string;
  /** Tooltip rendered via the label's info icon. BaseProps omits the native `title` attribute
   * (Astryx's own convention - components own their tooltip affordance instead), so this is the
   * stock replacement for a hover-only native `title` on the input box - and it's more
   * discoverable (a visible icon, reachable by keyboard/touch too). */
  labelTooltip?: string;
  /** Validation status (e.g. ProjectMetaFields' transient "rounded to N" note on Width/Height) -
   * renders via TextInput/Field's own status message box, replacing the old ad hoc `Field status`
   * usage on the native input it wrapped. */
  status?: TextInputStatus;
  /** Passed straight through to the real `<input>` - e.g. clearing a transient status note when
   * the field regains focus. */
  onFocus?: () => void;
  /** Help text shown between the label and the input (e.g. ProjectMetaFields' Fade in/Fade out
   * explanations). */
  description?: string;
}

/**
 * Adapter that binds `useNumericField`'s `NumericFieldBindings` to a stock Astryx `TextInput`,
 * replacing this app's hand-rolled native `<input>` + `plainField`/`numberInput` StyleX chrome
 * (2026-07-11 native-input stock-audit - the y2k theme's heavier native-input border visibly
 * clashed with Astryx's own bordered inputs elsewhere). TextInput is the only Astryx input that
 * can safely host the hook: `NumberInput` sanitizes keystrokes down to plain float syntax, which
 * would silently eat the M:SS.s shorthand and relative +/-n entry (trim-ux-conventions.md section
 * 4.4) before the hook's own parser ever sees it. TextInput is safe because it only routes through
 * `useOptimistic` when a `changeAction` prop is passed (never passed here), so
 * `optimisticValue === value` always holds and it behaves as a plain controlled input - no cursor
 * jump, no mid-typing lag.
 *
 * Renders label-BESIDE-input (not TextInput's own default label-above) by forcing
 * `FormLayoutContext` to `"horizontal-labels"` locally - the same mechanism `<FormLayout
 * direction="horizontal-labels">` provides ambient (see ProjectMetaFields.tsx), applied per-field
 * here so this adapter also works standalone inside a packed HStack row (Cut settings' In/Out,
 * Speed/Volume, etc.) that has no FormLayout ancestor. TextInput's own internal `Field` call reads
 * this context and switches to a `display:contents` two-cell (label, input) shape, which then
 * becomes two ordinary flex children of whatever flex/grid parent surrounds it - no extra markup
 * needed, and the label stays a real `<label htmlFor>` pointing at TextInput's own internally
 * generated input id (unlike wrapping a separate labeled `Field` around it from the outside, which
 * would produce a dangling `htmlFor` since that id isn't externally controllable - this is why the
 * app's old shared `InlineField` wrapper, built for exactly that purpose around native `<input>`s,
 * couldn't just be reused here and was retired instead once every native input it wrapped migrated
 * to this adapter).
 */
export function NumericInput({
  field,
  label,
  testId,
  width,
  labelTooltip,
  status,
  onFocus,
  description,
}: NumericInputProps) {
  return (
    <FormLayoutContext value={{ direction: "horizontal-labels" }}>
      <TextInput
        label={label}
        value={field.value}
        onChange={(_value, e) => field.onChange(e)}
        onBlur={field.onBlur}
        onKeyDown={field.onKeyDown}
        onFocus={onFocus}
        type="text"
        labelTooltip={labelTooltip}
        status={status}
        description={description}
        data-testid={testId}
        xstyle={width != null ? styles.width(width) : undefined}
      />
    </FormLayoutContext>
  );
}
