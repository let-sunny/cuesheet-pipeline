import { FormLayoutContext } from "@astryxdesign/core/FormLayout";
import { Selector } from "@astryxdesign/core/Selector";
import type { SelectorOptionType } from "@astryxdesign/core/Selector";
import { styles } from "./SelectField.styles.js";

export interface SelectFieldProps {
  label: string;
  value: string;
  options: SelectorOptionType[];
  onChange: (value: string) => void;
  /** data-testid on the trigger button's wrapping container (Selector takes this as a named prop,
   * not via `...rest`). */
  testId?: string;
  /** Narrows the trigger box (px, or any CSS width value) - e.g. 180, matching the old
   * `selectMedium` native-select width. Omit to let it size naturally. */
  width?: number | string;
}

/**
 * Adapter that replaces this app's hand-rolled native `<select>` + `plainField`/`selectMedium`
 * StyleX chrome with a stock Astryx `Selector` (2026-07-11 native-input stock-audit - same
 * motivation as `NumericInput`'s file comment: the y2k theme's native-select border visibly
 * clashed with Astryx's own bordered inputs elsewhere).
 *
 * Renders label-BESIDE-the-trigger by forcing `FormLayoutContext` to `"horizontal-labels"`
 * locally, exactly like `NumericInput` - see that component's file comment for the full mechanism
 * (TextInput/Selector both read this context in their own internal `Field` call and switch to a
 * `display:contents` two-cell shape that inlines into whatever flex/grid parent surrounds it, with
 * a real `<label htmlFor>` pointing at Selector's own internally generated trigger id).
 *
 * `value`/`onChange` stay plain strings (no `hasClear`/null-widening) - callers that need a
 * "(none)" choice keep doing exactly what the native `<select>` did: include an explicit
 * `{ value: "", label: "(none)" }` option and translate "" to `null` themselves at the call site,
 * so this adapter doesn't change any existing onChange signature.
 */
export function SelectField({ label, value, options, onChange, testId, width }: SelectFieldProps) {
  return (
    <FormLayoutContext value={{ direction: "horizontal-labels" }}>
      <Selector
        label={label}
        value={value}
        options={options}
        onChange={onChange}
        data-testid={testId}
        xstyle={width != null ? styles.width(width) : undefined}
      />
    </FormLayoutContext>
  );
}
