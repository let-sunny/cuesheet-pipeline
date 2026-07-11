# Design principles

The usability bar for this app, stated by the user (2026-07-11) and binding on every UI
decision. When a design choice is ambiguous, resolve it against these in order. This is a
personal, single-user editor on a 13-inch laptop — density and directness beat decoration.

## 1. Intuitive — follow conventions, never invent

Before designing any interaction (trim, scrubbing, lane editing, pickers, editing a title,
deleting, cropping), research how established editors solve it (Premiere, Final Cut, CapCut,
Descript, DaVinci, Notion/Docs for text) and adopt the convention. Users arrive with those
instincts. An invented mechanism is a defect even if it "works".

## 2. Hierarchy equals actual importance

Visual weight must match real importance. One clear primary action per group; everything else
recedes. A secondary control (mode toggle, "enter path manually") must never out-weigh the
primary one (Play, choosing a file). If two things look equally important, the design has
failed to decide.

## 3. Remove unnecessary information

Do not repeat what the user already knows from context. A panel titled "Cut settings" when
it's obviously the cut settings, a thumbnail in the edit cut-list when clicking the row already
shows the clip in the preview, a giant card around one line of read-only text — all cut.

## 4. Remove unnecessary decoration

Chrome scales to function. A large disclosure triangle becomes a small chevron; text buttons
for repeated row actions become icon buttons; a one-line section is a row, not a full-width
card. No ornament that doesn't carry information.

## 5. Components stay stock

Use Astryx components as designed, at their default variants. Customize only through named
wrappers when genuinely needed; never restyle via global CSS. The less custom styling, the
better — stock is the default, deviation needs a reason.

**The strict rule (2026-07-11):** custom CSS is allowed ONLY for layout structure — flex/grid,
direction, and which elements sit where. Everything else must come from Astryx: colors from
`--color-*` tokens, spacing/gaps/padding from `--spacing-*` tokens, corners from `--radius-*`,
type from `--font-*`/`--text-*`, borders/shadows from their tokens. No hardcoded hex, no literal
px for spacing or radius. The test: changing the theme must recolor and re-space EVERYTHING — if
a value doesn't follow the theme, it's a violation. Buttons/inputs/chips/badges are Astryx
components (Button, TextInput, Select, Chip, Badge, IconButton...), never hand-built `.plain-*`.

## 6. Minimal whitespace, 13-inch first

The target viewport is a 13-inch laptop (1280x800). Layouts must be dense: no wasted vertical
space, sections right-sized to content, the page must not run long when it does not need to. This applies to WIDTH too: a card whose content is narrow must not stretch full-width with an empty horizontal expanse — right-size boxes to their content on both axes.
Reclaim every gap that isn't doing separation work.

## The principle behind the principles: structure matches flow

Information architecture must match how the tool is actually used. A setting that affects the
whole edit (narration enable) belongs before/during editing, not at the end (Finish). An action
that needs an input first (Add BGM track needs a file) should ask for the input first, not
create an empty shell. Where a control lives, and in what order steps appear, encodes something
true about the workflow — get that right before styling anything.

## Adopting templates: purpose, then hierarchy, then the template

Astryx ships templates/blocks/compositions, not just primitives. Prefer adopting them over
hand-assembling — but choose by REASONING, not by looks. For any screen, decide in this order:
(1) purpose — what is this screen for; (2) goal — what is the user trying to accomplish here;
(3) data hierarchy — which information matters most, next, least. THEN pick the Astryx template
whose structure matches that hierarchy, and bring it in (fully tokenized/stock). Never import a
template because it's pretty; import it because its information structure fits the screen's
purpose. If nothing fits, compose primitives to the same standard — but check the template
catalog first, every time. We were reinventing things Astryx already does better.
