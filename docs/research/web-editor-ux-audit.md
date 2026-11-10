# Web editor UX audit (2026-11-10)

Why the user went back to DaVinci Resolve for finishing, measured on the running editor rather
than inferred. Trigger (user, 2026-11-10, paraphrased from Korean): subtitles were comfortable in
the web editor, adjusting the video was not; the overall layout is inconvenient - "after an edit
I scroll all the way to the top to find Save". The stated goal is a *video-based Vrew*: Vrew's
text-row editing was very comfortable, but it is driven by speech recognition and this footage
has no speech.

## Method

The editor was booted against a synthetic 120-cut cuesheet (three fixture clips, 8 timelapse
connectors, subtitles on 100 cuts) - a real episode is 80-174 cuts, while the checked-in e2e
fixture has 4, which is why none of this shows up in the smoke suite. Driven with Playwright at
1440x900 and 1280x800 (the 13-inch baseline in `docs/screen-spec.md`); positions read from
`getBoundingClientRect`. Not covered: real 4K footage, proxy generation time, playback smoothness.

## Findings

| # | Finding | Measurement | Status |
|---|---|---|---|
| 1 | Save / Undo / Redo / Export scroll away with the cut list | Edit step is 18,811px tall at 120 cuts; at the last cut the Save button is 17,873px above the viewport | Fixed in this change (header pinned) |
| 2 | No keyboard save, no autosave | `resolveShortcutAction` had no save action; Cmd/Ctrl+S opened the browser's own save dialog | Shortcut added in this change; autosave still open |
| 3 | The cut list is too sparse to scan | One cut card is ~156px tall: 5 cuts per 900px viewport, 24 screens for 120 cuts | Open |
| 4 | Cut rows carry no picture | A row shows subtitle text, a shot tag and a time range. With no speech the frame is the only thing that identifies a cut, so every cut has to be selected and previewed to know what it is | Open |
| 5 | Reordering is one position per click | Only up/down arrow buttons per row; no drag, no multi-select, no "move to" | Open |
| 6 | Video adjustment is split across three places and partly below the fold | Trim strip under the video, Mark In/Out below that, numeric In/Out in the right column. At the top of the page the transport row ends at ~y=920 on a 900px-tall viewport (worse at 800px): Rotate and the loop toggle are cut off until the page is scrolled | Open |
| 7 | Scrolling the list and the selected cut drift apart | The preview keeps showing the selected cut while the list can be thousands of pixels away from it; nothing brings the selection back into view | Open |
| 8 | Typing a subtitle turns the keyboard off | While a subtitle textarea is focused every shortcut except undo/redo (and now save) is swallowed, so there is no "next cut" from the keyboard mid-typing | Open |
| 9 | The mini timeline scrolls away | It sits above the cut list in normal flow, so the whole-episode context is lost as soon as the list scrolls | Open |

Findings 3, 4, 5 and 8 are one problem seen from four sides: the left column is a stack of form
cards, not a list of rows that can be read and edited like text.

## Direction: rows, not cards

What made Vrew comfortable is not speech recognition, it is that the edit list reads like a
document - one compact row per clip, edited with the keyboard. Speech only supplies the row's
text. Here the vision pass already supplies an equivalent for every cut (the moment memo and its
frame), so the same interaction model is available without speech:

- one row per cut: frame thumbnail, subtitle, duration - roughly a third of today's card height
- the keyboard stays live in a row: Enter moves to the next cut, Backspace at the start of an
  empty row merges with the previous one, a modifier + arrow moves the row
- drag to reorder, shift-click to select a range
- the list scrolls inside its own pane; header, preview and timeline never move

Per the repo's "no invented UI patterns" rule these are all existing conventions (Vrew, Descript,
any NLE's bin/list view), not new mechanisms. This is a redesign of the Edit step's left column
and is not part of this change.

## Changed here

- `HeaderBar` is pinned to the top of the viewport at a fixed 72px; the sequential-playback bar
  and the Edit step's sticky workspace sit below it (offsets and the two column height caps moved
  by the same 72px). Verified at 1440x900 and 1280x800 mid-scroll: Save visible, video and its
  whole control row inside the viewport.
- Cmd/Ctrl+S saves, including while typing in a field, and is listed in the shortcut help. A
  blocking overlay still swallows it, like every other shortcut.
