import { useEffect, useMemo, useState } from "react";
import * as stylex from "@stylexjs/stylex";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Badge } from "@astryxdesign/core/Badge";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Icon } from "@astryxdesign/core/Icon";
import { Overlay } from "@astryxdesign/core/Overlay";
import { SegmentedControl, SegmentedControlItem } from "@astryxdesign/core/SegmentedControl";
import { Text } from "@astryxdesign/core/Text";
import type { Segment } from "@cuesheet/schema";
import { FilterChip } from "../ui/FilterChip/index.js";
import { SceneCardButton } from "../ui/SceneCardButton/index.js";
import { fetchDraftFrames, fetchMoments } from "../../api.js";
import type { ClipMoments } from "../../api.js";
import type { Category, MomentCard, StatusFilter } from "../../lib/momentCards.js";
import {
  buildCards,
  CATEGORY_META,
  CATEGORY_ORDER,
  computeCategoryCounts,
  computeInUseCutNumbers,
  filterByStatus,
  filterCards,
  hasFaceTag,
  nearestFrame,
  stripFaceTag,
} from "../../lib/momentCards.js";
import { styles } from "./MomentPalette.styles.js";

interface Props {
  segments: Segment[];
  onAddSegment: (seg: Segment) => void;
  /** "Remove" for an already-added ("in use") card — removes the overlapping segment from the draft. */
  onRemoveSegment: (clip: string, inS: number, outS: number) => void;
}

/**
 * A palette that displays rough-classified "moment" cards by category and lets you add them
 * with a single click. Added segments are auto-inserted in chronological order by (clip, in)
 * regardless of where they're added (the caller, App.tsx, guarantees that ordering).
 */
export function MomentPalette({ segments, onAddSegment, onRemoveSegment }: Props) {
  const [moments, setMoments] = useState<ClipMoments[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [frameMap, setFrameMap] = useState<Record<string, string[]>>({});
  const [selectedCategory, setSelectedCategory] = useState<Category | "all">("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const data = await fetchMoments();
        setMoments(data);
      } catch (e) {
        setLoadError(e instanceof Error ? e.message : String(e));
      }
    })();
  }, []);

  const cards = useMemo(() => (moments ? buildCards(moments) : []), [moments]);

  useEffect(() => {
    if (!moments) {
      return;
    }
    const folders = Array.from(new Set(cards.map((c) => c.clipFolder)));
    void (async () => {
      const entries = await Promise.all(
        folders.map(async (folder) => [folder, await fetchDraftFrames(folder)] as const),
      );
      setFrameMap(Object.fromEntries(entries));
    })();
    // Populate the frame list only once, after moments has loaded.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moments]);

  // Whether a card is "in use", and if so, which cut number (timeline segment order, 1-based)
  // it was added as. Lets the same cut be tracked with the same number between the Compose and Edit steps.
  const inUseCutNumber = useMemo(() => computeInUseCutNumbers(cards, segments), [cards, segments]);

  // Category chip counts are computed over the STATUS-filtered set (not all cards) so the numbers
  // reflect the active status filter. Without this, "Wearing (4)" promises 4 while an active
  // "Excluded only" shows 0 (no wearing card is excluded), which reads as a broken filter - the
  // count must always match what clicking the chip actually reveals (faceted-filter convention).
  const statusFilteredCards = useMemo(
    () => filterByStatus(cards, statusFilter, inUseCutNumber),
    [cards, statusFilter, inUseCutNumber],
  );
  const counts = useMemo(() => computeCategoryCounts(statusFilteredCards), [statusFilteredCards]);
  // Which category chips exist at all is decided by the FULL set (not the status-filtered one), so
  // the chip row stays stable as you toggle the status filter - a category that drops to 0 under
  // "Excluded only" stays visible showing "(0)" rather than vanishing (user feedback: a category
  // blinking out of the row is disorienting; 0 should read as 0).
  const fullCounts = useMemo(() => computeCategoryCounts(cards), [cards]);

  const filtered = filterCards(cards, selectedCategory, statusFilter, inUseCutNumber);
  // Whether either filter axis narrows the grid - drives the header count (below), which
  // otherwise reads as a static total that never changes and makes filtering look like it does
  // nothing (user feedback 2026-07-11).
  const isFiltered = selectedCategory !== "all" || statusFilter !== "all";

  const handleAdd = (card: MomentCard) => {
    if (hasFaceTag(card.memo)) {
      const proceed = window.confirm("May violate the face policy - reframing might be needed");
      if (!proceed) {
        return;
      }
    }
    const seg: Segment = {
      clip: card.clipFileName,
      in: card.inS,
      out: card.outS,
      speed: 1,
      volume: 1,
      subtitle: stripFaceTag(card.memo),
    };
    onAddSegment(seg);
  };

  if (loadError) {
    return <div {...stylex.props(styles.paletteStatus)}>Couldn't load scene candidates: {loadError}</div>;
  }
  if (!moments) {
    return <div {...stylex.props(styles.paletteStatus)}>Loading scene candidates…</div>;
  }

  return (
    <div {...stylex.props(styles.palette)}>
      <div {...stylex.props(styles.header)}>
        {/* Reflects the active filter (2026-07-11 user feedback: a static total never changed
            when a filter was applied, so filtering looked like it did nothing) - "N of TOTAL"
            once either filter axis narrows the grid, plain "TOTAL" otherwise. */}
        <span>Scene candidates ({isFiltered ? `${filtered.length} of ${cards.length}` : cards.length})</span>
        <Button
          label={collapsed ? "Expand" : "Collapse"}
          variant="ghost"
          size="sm"
          onClick={() => setCollapsed((v) => !v)}
        />
      </div>

      {collapsed ? null : cards.length === 0 ? (
        <EmptyState
          title="No scene candidates yet"
          description="Run `pnpm episode` with a source folder to generate them automatically."
          isCompact
        />
      ) : (
        <>
          {/* Two orthogonal filter facets (2026-07-11 faceted-filtering restructure, per NN/g
              Filters-vs-Facets and Hearst's faceted navigation research): status and category are
              independent axes, so each gets its own control TYPE rather than being flattened into
              one row of lookalike chips.

              Row 1 (status): a stock Astryx SegmentedControl - the spec-correct control for a
              small (2-5), mutually-exclusive value set (`astryx component SegmentedControl`).
              Controlled straight off statusFilter/setStatusFilter, same as VideoPreview's
              playMode control. No `data-testid` here or on the items - verified against the
              installed `SegmentedControl`/`SegmentedControlItem` source (dist), and like
              `CheckboxInput` (CLAUDE.md), both destructure a fixed prop list with no `...rest`
              capture at all, so a `data-testid` would be silently dropped. Select in tests by
              `role="radiogroup"`/`role="radio"` + accessible name instead (same convention
              VideoPreview.test.tsx already uses for playMode). */}
          <div {...stylex.props(styles.statusRow)}>
            <SegmentedControl
              value={statusFilter}
              onChange={(v) => setStatusFilter(v as StatusFilter)}
              label="Filter by status"
              size="sm"
            >
              <SegmentedControlItem value="all" label="All" />
              <SegmentedControlItem value="in-use" label="In use" />
              <SegmentedControlItem value="excluded" label="Excluded" />
            </SegmentedControl>
          </div>

          {/* Row 2 (category): a single-row, horizontally-scrolling pill strip. Deliberately
              STANDALONE controlled `ToggleButton`s (`isPressed`/`onPressedChange`), NOT wrapped in
              `ToggleButtonGroup` - the group coordinates selection through a React context, and
              Astryx's Vite/StyleX dev setup loads `@astryxdesign/core`'s `ToggleButtonGroup` source
              module twice (once pre-bundled `?v=hash`, once raw via the `source` export
              condition), so the provider and the `useToggleButtonGroup()` consumer end up on two
              different context objects - the hook reads null and every chip click is a silent
              no-op (confirmed in a real browser; jsdom can't reproduce Vite's dual-instance
              resolution, so unit tests passed while the running app was dead). Driving each chip's
              pressed state directly from our own selectedCategory state sidesteps the context
              entirely. Clicking the active chip clears back to "all" (the single-select affordance
              we had before).

              A category whose faceted count (`counts`, computed over the status-filtered set) is
              0 renders dimmed + disabled rather than vanishing (Hearst/Algolia "avoid empty
              results" - a ghost option, not a live one) - `isDisabled` forwards straight through
              to Button (ToggleButton has no ...rest capture gap; it spreads the disabled state
              onto Button, which applies its own dimmed `disabled` style). */}
          <div role="group" aria-label="Filter by category" {...stylex.props(styles.categoryStrip)}>
            <FilterChip
              size="sm"
              label={`All (${statusFilteredCards.length})`}
              isPressed={selectedCategory === "all"}
              onPressedChange={() => setSelectedCategory("all")}
            />
            {CATEGORY_ORDER.filter((cat) => (fullCounts.get(cat) ?? 0) > 0).map((cat) => {
              const count = counts.get(cat) ?? 0;
              return (
                <FilterChip
                  key={cat}
                  size="sm"
                  label={`${CATEGORY_META[cat].label} (${count})`}
                  isPressed={selectedCategory === cat}
                  isDisabled={count === 0}
                  onPressedChange={() => setSelectedCategory(selectedCategory === cat ? "all" : cat)}
                />
              );
            })}
          </div>

          <div {...stylex.props(styles.grid)}>
            {filtered.map((card) => {
              const meta = CATEGORY_META[card.category];
              const frames = frameMap[card.clipFolder] ?? [];
              const frame = nearestFrame(frames, card.inS);
              const cutNumber = inUseCutNumber.get(card.key);
              const inUse = cutNumber !== undefined;
              const faceRejected = !inUse && hasFaceTag(card.memo);
              const qualityRejected = !inUse && !faceRejected && card.quality !== null && card.quality < 3;
              const displayMemo = hasFaceTag(card.memo) ? stripFaceTag(card.memo) : card.memo;
              // The card itself only shows an abbreviated clip name and timestamp; the full
              // information needed for judgment (original filename, range, category, memo) is conveyed via the title tooltip.
              const fullInfo = `${card.clipFileName} · ${card.inS.toFixed(1)}s~${card.outS.toFixed(1)}s · ${meta.label} · ${displayMemo}`;

              const rejectedLabel = faceRejected
                ? "Auto-excluded: face exposure"
                : qualityRejected
                  ? "Auto-excluded: low quality"
                  : null;
              return (
                // Card(BaseProps) explicitly omits title (it's on the footgun list), so this
                // plain wrapper div takes over the card's full-info tooltip instead.
                <div
                  {...stylex.props(styles.cardWrap)}
                  key={card.key}
                  title={fullInfo}
                  data-testid={`palette-card-${card.key}`}
                >
                  <Card
                    padding={0}
                    className={
                      stylex.props(
                        styles.card,
                        faceRejected && styles.cardStatusRejectedFace,
                        qualityRejected && styles.cardStatusRejectedQuality,
                      ).className
                    }
                  >
                    {/* Horizontal card layout (2026-07-11 QA fix - researched convention: Premiere's
                        bin thumbnail view / Final Cut's event browser / DaVinci's media pool all lay
                        out a clip card as thumbnail-left-at-a-usable-size + metadata-stacked-right,
                        rather than a small thumbnail crammed above a narrow column, so previously-
                        168px-wide cards read as "too small" - adopted as-is (CLAUDE.md "no invented
                        UI patterns"). `thumbCol` fixes the thumbnail to its own wider column instead
                        of letting it size to the whole (now much wider) card; `cardRow` is the plain
                        horizontal flex wrapper, stretched to a fixed height (see `cardRow`'s comment)
                        so `thumbCol` fills that height edge to edge. Every card - excluded or not -
                        renders exactly this one row now (2026-07-11 uniform-height fix, see `card`'s
                        comment: the exclusion reason used to be a sibling banner ABOVE this row,
                        which made excluded cards taller than their grid neighbors); it's gone from
                        the flow entirely, replaced by the thumbnail-overlay scrim below. */}
                    <div {...stylex.props(styles.cardRow)}>
                      {/* Full-bleed thumbnail (2026-07-11 QA fix, design-principles.md #6 "no wasted
                          space"): AspectRatio(16:9) was dropped - it constrained the thumbnail to a
                          ratio-derived height regardless of the column's actual (now fixed-row-height)
                          box, which left letterbox gaps. A plain div stretched to 100%/100% (via
                          `cardRow`'s alignItems:stretch + this Overlay's own xstyle height:100%) plus
                          `objectFit:cover` on the img fills thumbCol edge to edge instead, cropping the
                          frame as needed - the user confirmed cropping is fine here. `thumbCol` is
                          `position:relative` so both the in-use badge (via Overlay's own absolute
                          scrim) and the exclusion scrim below can anchor to just this thumbnail box,
                          never the card at large. The clip-folder/timestamp chip that used to share
                          this corner was removed (2026-07-11 user feedback: declutter the thumbnail,
                          move all text metadata to the card's right side, see `metaCluster` below) -
                          the only thing left on the frame itself is the in-use cut-number badge
                          (a real status Badge, variant="success") and, when excluded, the reason
                          scrim. */}
                      <div {...stylex.props(styles.thumbCol)}>
                        <Overlay
                          scrim={false}
                          showOn="always"
                          position="top"
                          xstyle={styles.thumbOverlay}
                          content={inUse ? <Badge variant="success" label={String(cutNumber)} /> : null}
                        >
                          {frame ? (
                            <img
                              src={`/draft-frames/${encodeURIComponent(card.clipFolder)}/${encodeURIComponent(frame)}`}
                              alt=""
                              style={{ objectFit: "cover", width: "100%", height: "100%", display: "block" }}
                            />
                          ) : (
                            <div {...stylex.props(styles.thumbEmpty)} />
                          )}
                        </Overlay>
                        {/* Auto-exclusion reason - now an absolute overlay on the thumbnail itself,
                            not a top banner that used to sit above `cardRow` as an extra sibling row
                            (user directive 2026-07-11, overriding the 2026-07-09 top-banner decision
                            recorded here previously: cover the thumbnail with an absolute overlay so
                            the reason only shows there). A banner
                            added a whole extra row's worth of height only to excluded cards, so grid
                            rows were never uniform (the user's main complaint); this scrim adds zero
                            height - `thumbCol`/`cardRow` are exactly the same size in every state. The
                            Add button stays active either way - auto-exclusion isn't a "ban," it's
                            just "what auto-assembly filtered out," so it can always be brought back. */}
                        {rejectedLabel ? (
                          <div
                            {...stylex.props(
                              styles.exclusionScrim,
                              faceRejected ? styles.exclusionScrimFace : styles.exclusionScrimQuality,
                            )}
                          >
                            {rejectedLabel}
                          </div>
                        ) : null}
                      </div>
                      {/* Card hierarchy (screen-spec section 2): thumbnail -> scene description
                          (scrolls internally, see memoWrap's comment) -> metadata cluster (clip
                          filename/time range/category/quality, see `metaCluster`'s comment) ->
                          action, pinned bottom-right (see `actionsGroup`'s comment). Card-internal
                          spacing rules (screen-spec 0-1/0-2): consistent padding plus a clear gap
                          between groups, all handled by cardBody, so every card in a grid row aligns
                          the same way regardless of state or content length (2026-07-11 user
                          feedback: the internal spacing needed a consistent pass so alignment
                          would be consistent). */}
                      <div {...stylex.props(styles.cardBody)}>
                        <div {...stylex.props(styles.memoWrap)}>
                          <Text type="supporting" maxLines={0}>
                            {displayMemo}
                          </Text>
                        </div>
                        {/* Metadata cluster (2026-07-11 user feedback: filename/time/quality-style
                            metadata is fine grouped on the card's right side) - the clip filename,
                            time range, category, and quality all read as one quiet, secondary group
                            below the description rather than being scattered (filename/time used to
                            live on the thumbnail overlay; category/quality used to be their own
                            unlabeled `info` row). `quality`'s `title` explains what the number means
                            (user asked what "Quality" meant) - it's the vision reader's 1-5 usability
                            score that auto-assembly's keep-threshold (3+) is judged against. */}
                        <div {...stylex.props(styles.metaCluster)}>
                          <span {...stylex.props(styles.metaFile)}>
                            {card.clipFileName} · {card.inS.toFixed(1)}s~{card.outS.toFixed(1)}s
                          </span>
                          <div {...stylex.props(styles.metaRow)}>
                            <Badge variant={meta.badgeVariant} label={meta.label} xstyle={styles.categoryBadge} />
                            {card.quality != null ? (
                              <span
                                {...stylex.props(styles.quality)}
                                title="Vision-judged usability of this moment (1-5). Auto-assembly keeps 3 and up."
                              >
                                Quality {card.quality}/5
                              </span>
                            ) : null}
                          </div>
                        </div>
                        {/* Add/Remove pinned to the card's bottom-right corner (2026-07-11 user
                            feedback: add-to-cut/remove-cut should sit in the single most important
                            spot, the card's bottom-right) - the card's single most important action,
                            so it gets the single most prominent corner. `actionsGroup`'s
                            `marginTop:auto` pushes it
                            to the bottom of cardBody's fixed-height column; `justifyContent:flex-end`
                            right-aligns it within that row. Single state-driven toggle (2026-07-09
                            diagnosed fix) replaces the old Add/Remove pair (one button always
                            visually disabled, the other hidden via a same-space "placeholder" class)
                            - one action, one button, the label/icon flips with whether the card is
                            already added. Excluded (auto-filtered) cards keep the same confirm-before-
                            adding flow either way (handleAdd's face-policy check runs regardless).
                            Icon-only (2026-07-11 QA fix, design-principles.md #4 "decoration scales
                            to function"); `label` still carries the accessible name (announced via
                            IconButton's aria-label) and `tooltip` supplies the visible hint the icon
                            alone can't. Kept `variant="ghost"` even in this now-most-important corner
                            - the bottom-right position itself is what signals primacy (matches the
                            researched convention of a media browser's per-item action slot), not a
                            heavier fill that would compete with the card's actual content. */}
                        <div {...stylex.props(styles.actionsGroup)}>
                          <SceneCardButton
                            icon={<Icon icon={inUse ? "close" : "check"} size="sm" />}
                            label={inUse ? "Remove" : "Add"}
                            variant="ghost"
                            size="sm"
                            tooltip={inUse ? "Remove from cuts" : "Add to cuts"}
                            onClick={() =>
                              inUse ? onRemoveSegment(card.clipFileName, card.inS, card.outS) : handleAdd(card)
                            }
                            data-testid={`palette-card-toggle-${card.key}`}
                          />
                        </div>
                      </div>
                    </div>
                  </Card>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
