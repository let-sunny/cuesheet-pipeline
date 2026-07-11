import { Field, type FieldProps } from "@astryxdesign/core/Field";
import { styles } from "./InlineField.styles.js";

export type InlineFieldProps = FieldProps;

/**
 * Role: Field wrapper that forces a single-line "label beside input" layout. Field's own two
 * directions don't fit a packed row of short fields - the default (vertical) stacks the label
 * above the input (too tall once several such fields share one row), and 'horizontal-labels' also
 * puts the label beside the input, but only by claiming a full grid row from an ancestor
 * FormLayout (one field per row, not several side by side). Used everywhere Cut settings/BGM pack
 * more than one compact field onto a line (In/Out, Speed/Volume, title/transition Dur., BGM
 * Start/End/Volume) - the same `flexDirection: row` override on Field would otherwise repeat at
 * every call site (CLAUDE.md "component layering": promote a tweak used more than once to a named
 * wrapper).
 */
export function InlineField(props: InlineFieldProps) {
  return <Field {...props} xstyle={styles.inline} />;
}
