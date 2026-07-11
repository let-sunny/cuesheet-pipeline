import { useEffect, useMemo, useState } from "react";
import * as stylex from "@stylexjs/stylex";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Badge } from "@astryxdesign/core/Badge";
import { Icon } from "@astryxdesign/core/Icon";
import { Overlay } from "@astryxdesign/core/Overlay";
import { Text } from "@astryxdesign/core/Text";
import { ToggleButtonGroup } from "@astryxdesign/core/ToggleButton";
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
  STATUS_FILTER_LABEL,
  computeCategoryCounts,
  computeInUseCutNumbers,
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

  const counts = useMemo(() => computeCategoryCounts(cards), [cards]);

  // Whether a card is "in use", and if so, which cut number (timeline segment order, 1-based)
  // it was added as. Lets the same cut be tracked with the same number between the Compose and Edit steps.
  const inUseCutNumber = useMemo(() => computeInUseCutNumbers(cards, segments), [cards, segments]);

  const filtered = filterCards(cards, selectedCategory, statusFilter, inUseCutNumber);

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
        <span>Scene candidates ({cards.length})</span>
        <Button
          label={collapsed ? "Expand" : "Collapse"}
          variant="ghost"
          size="sm"
          onClick={() => setCollapsed((v) => !v)}
        />
      </div>

      {collapsed ? null : cards.length === 0 ? (
        <div className="empty-state">
          No scene candidates yet - run <code>pnpm episode</code> with a source folder to generate them automatically.
        </div>
      ) : (
        <>
          {/* Category/status filter chips (2026-07-11 stock-component migration) - a stock Astryx
              ToggleButtonGroup (type="single") replaces the old raw `.plain-button` row. Clicking the
              already-active chip deselects to null (ToggleButtonGroup's built-in single-select
              behavior) - mapped back to "all" here rather than fought, which doubles as a handy
              "click again to clear the filter" affordance. `xstyle` only adds flex-wrap (categories
              can exceed one row's width on a 13" viewport) - the chips' own look is entirely stock. */}
          <ToggleButtonGroup
            type="single"
            label="Filter by category"
            value={selectedCategory}
            onChange={(v) => setSelectedCategory((v ?? "all") as Category | "all")}
            size="sm"
            xstyle={styles.filters}
          >
            <FilterChip value="all" label={`All (${cards.length})`} />
            {CATEGORY_ORDER.filter((cat) => (counts.get(cat) ?? 0) > 0).map((cat) => (
              <FilterChip key={cat} value={cat} label={`${CATEGORY_META[cat].label} (${counts.get(cat) ?? 0})`} />
            ))}
          </ToggleButtonGroup>

          <ToggleButtonGroup
            type="single"
            label="Filter by status"
            value={statusFilter}
            onChange={(v) => setStatusFilter((v ?? "all") as StatusFilter)}
            size="sm"
            xstyle={styles.filters}
          >
            {(["all", "in-use", "excluded"] as const).map((f) => (
              <FilterChip key={f} value={f} label={STATUS_FILTER_LABEL[f]} />
            ))}
          </ToggleButtonGroup>

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
                    {/* The auto-exclusion reason is a full-width banner at the top of the card - much
                        more noticeable than a small corner badge over the thumbnail, removing the
                        "what's faded vs. what's solid" misreading (feedback 2026-07-08). The Add
                        button stays active even in this state - auto-exclusion isn't a "ban," it's
                        just "what auto-assembly filtered out," so it can always be brought back.
                        Kept custom rather than expressed via Overlay (2026-07-09 evaluation, see
                        docs/screen-spec.md section 2): Overlay renders its content ON TOP of the
                        media it wraps (an overlapping layer), but this banner needs to sit ABOVE the
                        thumbnail in normal flow, pushing it down without covering any of the frame -
                        the opposite of what Overlay composes. It also spans the whole card, not just
                        the thumbnail that Overlay wraps. So it stays a plain full-width div outside
                        the Overlay composition below. */}
                    {rejectedLabel ? (
                      <div
                        {...stylex.props(
                          styles.statusBanner,
                          faceRejected ? styles.statusBannerFace : styles.statusBannerQuality,
                        )}
                      >
                        {rejectedLabel}
                      </div>
                    ) : null}
                    {/* Horizontal card layout (2026-07-11 QA fix - researched convention: Premiere's
                        bin thumbnail view / Final Cut's event browser / DaVinci's media pool all lay
                        out a clip card as thumbnail-left-at-a-usable-size + metadata-stacked-right,
                        rather than a small thumbnail crammed above a narrow column, so previously-
                        168px-wide cards read as "too small" - adopted as-is (CLAUDE.md "no invented
                        UI patterns"). `thumbCol` fixes the thumbnail to its own wider column instead
                        of letting it size to the whole (now much wider) card; `cardRow` is the plain
                        horizontal flex wrapper, stretched to a fixed height (2026-07-11 uniform-card
                        fix, see `card`'s comment) so `thumbCol` fills that height edge to edge. The
                        status banner above stays OUTSIDE this row (full card width, on its own line,
                        additive to the fixed height for that rare state) per the existing exclusion-
                        banner rule - only the thumbnail+body pairing goes side by side. */}
                    <div {...stylex.props(styles.cardRow)}>
                      {/* Full-bleed thumbnail (2026-07-11 QA fix, design-principles.md #6 "no wasted
                          space"): AspectRatio(16:9) was dropped - it constrained the thumbnail to a
                          ratio-derived height regardless of the column's actual (now fixed-row-height)
                          box, which left letterbox gaps. A plain div stretched to 100%/100% (via
                          `cardRow`'s alignItems:stretch + this Overlay's own xstyle height:100%) plus
                          `objectFit:cover` on the img fills thumbCol edge to edge instead, cropping the
                          frame as needed - the user confirmed cropping is fine here. Overlay's own
                          "top" content region still holds the chip/badge row; the row stays flex-wrap
                          (space-between) so a long clip folder name still wraps the badge to the next
                          line instead of overlapping or truncating it (2026-07-08 feedback). The
                          index/timestamp chip stays a plain styled span, not a Badge — it's a caption
                          of "which clip/where", not a status with color semantics, so Badge would be a
                          semantic mismatch; the "in use" indicator IS a status, so that one is a real
                          Badge (variant="success"). */}
                      <div {...stylex.props(styles.thumbCol)}>
                        <Overlay
                          scrim={false}
                          showOn="always"
                          position="top"
                          xstyle={styles.thumbOverlay}
                          content={
                            <div {...stylex.props(styles.overlayRow)}>
                              <span {...stylex.props(styles.number)}>
                                {card.clipFolder} · {card.inS.toFixed(1)}s
                              </span>
                              {/* Just the cut number (2026-07-11 QA fix, design-principles.md #3
                                  "remove unnecessary information") - the user only needs to know
                                  which cut this maps to, not a restated "In use - cut N" sentence;
                                  bare numbering matches CompactSegmentList's own cut-index convention. */}
                              {inUse ? <Badge variant="success" label={String(cutNumber)} xstyle={styles.badgeInUse} /> : null}
                            </div>
                          }
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
                      </div>
                      {/* Card hierarchy (screen-spec section 2): thumbnail -> scene description
                          (scrolls internally, see memoWrap's comment) -> meta (shot type/duration/
                          quality) -> actions. Card-internal spacing rules (screen-spec 0-1/0-2):
                          consistent 12px padding plus a clear gap between groups (description/meta/
                          actions) are handled entirely by cardBody. */}
                      <div {...stylex.props(styles.cardBody)}>
                        <div {...stylex.props(styles.memoWrap)}>
                          <Text type="supporting" maxLines={0}>
                            {displayMemo}
                          </Text>
                        </div>
                        <div {...stylex.props(styles.info)}>
                          {/* Smaller/quieter (2026-07-11 QA fix, design-principles.md #4 "decoration
                              scales to function") - category is secondary metadata alongside
                              duration/quality, not a heading, so it shouldn't out-weigh them. Badge
                              has no size prop, so `categoryBadge` trims font-size/padding via xstyle
                              (the sanctioned per-instance override mechanism) rather than a full
                              custom badge. */}
                          <Badge variant={meta.badgeVariant} label={meta.label} xstyle={styles.categoryBadge} />
                          <span className="moment-duration">{(card.outS - card.inS).toFixed(1)}s</span>
                          {card.quality != null ? (
                            <span {...stylex.props(styles.quality)}>Quality {card.quality}/5</span>
                          ) : null}
                        </div>
                        <div {...stylex.props(styles.actionsGroup)}>
                          {/* Single state-driven toggle (2026-07-09 diagnosed fix) replaces the old
                              Add/Remove pair (one button always visually disabled, the other hidden
                              via a same-space "placeholder" class) - one action, one button, the
                              label/icon flips with whether the card is already added. Excluded
                              (auto-filtered) cards keep the same confirm-before-adding flow either
                              way (handleAdd's face-policy check runs regardless). Icon-only
                              (2026-07-11 QA fix, design-principles.md #4 "decoration scales to
                              function" - repeated card actions read as too large as text buttons);
                              `label` still carries the accessible name (announced via IconButton's
                              aria-label) and `tooltip` supplies the visible hint the icon alone
                              can't. `variant="ghost"` (2026-07-11 QA fix) - this is a per-card row
                              action, the least prominent thing on the card, not a page-level primary/
                              destructive action, so it should read quietly until hovered. */}
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

