import { useEffect, useMemo, useState } from "react";
import { AspectRatio } from "@astryxdesign/core/AspectRatio";
import { Card } from "@astryxdesign/core/Card";
import { Badge } from "@astryxdesign/core/Badge";
import { Overlay } from "@astryxdesign/core/Overlay";
import { Text } from "@astryxdesign/core/Text";
import type { Segment } from "@cuesheet/schema";
import { SceneCardButton } from "./ui/SceneCardButton/index.js";
import { IntroOutroButton } from "./ui/IntroOutroButton/index.js";
import { fetchDraftFrames, fetchMoments } from "../api.js";
import type { ClipMoments } from "../api.js";
import { INTRO_OUTRO_MAX_DURATION_S, buildClipPath, computeClipDurations } from "../clipPaths.js";
import type { Category, MomentCard, StatusFilter } from "../lib/momentCards.js";
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
} from "../lib/momentCards.js";

interface Props {
  segments: Segment[];
  clipDir: string;
  introPath: string | null;
  outroPath: string | null;
  onAddSegment: (seg: Segment) => void;
  /** "Remove" for an already-added ("in use") card — removes the overlapping segment from the draft. */
  onRemoveSegment: (clip: string, inS: number, outS: number) => void;
  /** Sets this whole clip file as the intro/outro (ignoring the range, the entire clip as one piece). */
  onSetIntro: (clipFileName: string) => void;
  onSetOutro: (clipFileName: string) => void;
}

/**
 * A palette that displays rough-classified "moment" cards by category and lets you add them
 * with a single click. Added segments are auto-inserted in chronological order by (clip, in)
 * regardless of where they're added (the caller, App.tsx, guarantees that ordering).
 */
export function MomentPalette({
  segments,
  clipDir,
  introPath,
  outroPath,
  onAddSegment,
  onRemoveSegment,
  onSetIntro,
  onSetOutro,
}: Props) {
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

  // Approximate duration per clip (seconds) — used to decide the 15s cap for the intro/outro assignment buttons.
  const clipDurations = useMemo(() => (moments ? computeClipDurations(moments) : {}), [moments]);

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
    return <div className="moment-palette status">Couldn't load scene candidates: {loadError}</div>;
  }
  if (!moments) {
    return <div className="moment-palette status">Loading scene candidates…</div>;
  }

  return (
    <div className="moment-palette">
      <div className="moment-palette-header">
        <span>Scene candidates ({cards.length})</span>
        <button type="button" className="plain-button" onClick={() => setCollapsed((v) => !v)}>
          {collapsed ? "Expand" : "Collapse"}
        </button>
      </div>

      {collapsed ? null : cards.length === 0 ? (
        <div className="empty-state">
          No scene candidates yet - run <code>pnpm episode</code> with a source folder to generate them automatically.
        </div>
      ) : (
        <>
          <div className="moment-filters">
            <button
              type="button"
              className={`plain-button${selectedCategory === "all" ? " active" : ""}`}
              onClick={() => setSelectedCategory("all")}
            >
              All ({cards.length})
            </button>
            {CATEGORY_ORDER.filter((cat) => (counts.get(cat) ?? 0) > 0).map((cat) => (
              <button
                type="button"
                key={cat}
                className={`plain-button${selectedCategory === cat ? " active" : ""}`}
                onClick={() => setSelectedCategory(cat)}
              >
                {CATEGORY_META[cat].label} ({counts.get(cat) ?? 0})
              </button>
            ))}
          </div>

          <div className="moment-filters moment-status-filters">
            {(["all", "in-use", "excluded"] as const).map((f) => (
              <button
                type="button"
                key={f}
                className={`plain-button${statusFilter === f ? " active" : ""}`}
                onClick={() => setStatusFilter(f)}
              >
                {STATUS_FILTER_LABEL[f]}
              </button>
            ))}
          </div>

          <div className="moment-grid">
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

              // Intro/outro insert the whole clip as one piece with no in/out range, so
              // assignment is blocked if this card's clip file's total length (approximate) exceeds the cap.
              const clipDurationS = clipDurations[card.clipFileName];
              const tooLongForIntroOutro =
                clipDurationS === undefined || clipDurationS > INTRO_OUTRO_MAX_DURATION_S;
              const cardClipPath = buildClipPath(clipDir, card.clipFileName);
              const isIntro = introPath === cardClipPath;
              const isOutro = outroPath === cardClipPath;
              const introOutroDisabledTitle = tooLongForIntroOutro
                ? `Clips over 15s (est. ${clipDurationS?.toFixed(1) ?? "?"}s) can't be used as intro/outro — since the whole clip is inserted without a range, this only works for short clips.`
                : null;
              const statusClass = faceRejected
                ? " status-rejected-face"
                : qualityRejected
                  ? " status-rejected-quality"
                  : "";
              const rejectedLabel = faceRejected
                ? "Auto-excluded: face exposure"
                : qualityRejected
                  ? "Auto-excluded: low quality"
                  : null;
              return (
                // Card(BaseProps) explicitly omits title (it's on the footgun list), so this
                // plain wrapper div takes over the card's full-info tooltip instead.
                <div
                  className="moment-card-wrap"
                  key={card.key}
                  title={fullInfo}
                  data-testid={`palette-card-${card.key}`}
                >
                  <Card
                    padding={0}
                    className={`moment-card${inUse ? " in-use" : ""}${statusClass}`}
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
                        the thumbnail that Overlay/AspectRatio wrap. So it stays a plain full-width div
                        outside the Overlay composition below. */}
                    {rejectedLabel ? (
                      <div className={`moment-status-banner${faceRejected ? " face" : " quality"}`}>
                        {rejectedLabel}
                      </div>
                    ) : null}
                    {/* Astryx composition (2026-07-09, replaces the earlier hand-rolled .moment-thumb):
                        Thumbnail (Astryx) is fixed-square with no overlay slot at all, so it never fit this
                        card (16:9 frame + number chip + status badge). AspectRatio(16/9) + Overlay
                        (position="top", scrim off so it doesn't dim the frame) is the documented
                        composition instead — Overlay's own "top" content region replaces the old
                        absolutely-positioned .moment-thumb-overlay div, so the chip/badge row itself no
                        longer needs position/top/left, just flex layout. The row stays flex-wrap
                        (space-between) so a long clip folder name still wraps the badge to the next line
                        instead of overlapping or truncating it (2026-07-08 feedback). The index/timestamp
                        chip stays a plain styled span, not a Badge — it's a caption of "which clip/where",
                        not a status with color semantics, so Badge would be a semantic mismatch; the "in
                        use" indicator IS a status, so that one is a real Badge (variant="success"). */}
                    <Overlay
                      scrim={false}
                      showOn="always"
                      position="top"
                      content={
                        <div className="moment-overlay-row">
                          <span className="moment-number">
                            {card.clipFolder} · {card.inS.toFixed(1)}s
                          </span>
                          {inUse ? (
                            <Badge
                              variant="success"
                              label={`In use - cut ${cutNumber}`}
                              className="moment-badge-in-use"
                            />
                          ) : null}
                        </div>
                      }
                    >
                      <AspectRatio ratio={16 / 9}>
                        {frame ? (
                          <img
                            src={`/draft-frames/${encodeURIComponent(card.clipFolder)}/${encodeURIComponent(frame)}`}
                            alt=""
                            style={{ objectFit: "cover", width: "100%", height: "100%" }}
                          />
                        ) : (
                          <div className="moment-thumb-empty" />
                        )}
                      </AspectRatio>
                    </Overlay>
                    {/* Card hierarchy (screen-spec section 2): thumbnail -> status badge (top,
                        thumbnail overlay) -> scene description (full text, wrapping allowed) ->
                        meta (shot type/duration/quality) -> actions. Since this screen is for
                        "reading and picking" scenes, the description clamp was removed
                        (maxLines={0} = no clamp). Card-internal spacing rules (screen-spec 0-1/0-2):
                        consistent 12px padding plus a clear gap between groups (description/meta/
                        actions) are handled entirely by .moment-card-body. */}
                    <div className="moment-card-body">
                      <div className="moment-memo-wrap">
                        <Text type="supporting" maxLines={0}>
                          {displayMemo}
                        </Text>
                      </div>
                      <div className="moment-info">
                        <Badge variant={meta.badgeVariant} label={meta.label} />
                        <span className="moment-duration">{(card.outS - card.inS).toFixed(1)}s</span>
                        {card.quality != null ? (
                          <span className="moment-quality">Quality {card.quality}/5</span>
                        ) : null}
                      </div>
                      <div className="moment-actions-group">
                        {/* Single state-driven toggle (2026-07-09 diagnosed fix) replaces the old
                            Add/Remove pair (one button always visually disabled, the other hidden
                            via a same-space "placeholder" class) - one action, one button, the
                            label/variant flips with whether the card is already added. Excluded
                            (auto-filtered) cards keep the same confirm-before-adding flow either
                            way (handleAdd's face-policy check runs regardless of this button). */}
                        <div className="moment-card-actions">
                          <SceneCardButton
                            label={inUse ? "Remove" : "Add"}
                            variant={inUse ? "destructive" : "primary"}
                            size="sm"
                            onClick={() =>
                              inUse ? onRemoveSegment(card.clipFileName, card.inS, card.outS) : handleAdd(card)
                            }
                            data-testid={`palette-card-toggle-${card.key}`}
                          />
                        </div>
                        {/* Set-as-intro/outro labels shortened "Set as intro/outro" -> "Set
                            intro/outro" (2026-07-09 diagnosed fix) - the longer phrase truncated
                            in this row's ~equal-width slot on typical card widths; the full
                            meaning stays available via the tooltip. Kept as a same-row pair
                            (screen-spec rule 0-4, "pairs sit side by side") rather than icons -
                            introducing icon glyphs with no existing icon system in this app would
                            be a bigger, separate call. */}
                        <div className="moment-io-actions">
                          <IntroOutroButton
                            label={isIntro ? "Intro set" : "Set intro"}
                            size="sm"
                            active={isIntro}
                            isDisabled={tooLongForIntroOutro}
                            tooltip={
                              introOutroDisabledTitle ??
                              "Sets this whole clip as the intro (no range - the entire clip is inserted)"
                            }
                            onClick={() => onSetIntro(card.clipFileName)}
                            data-testid={`palette-card-set-intro-${card.key}`}
                          />
                          <IntroOutroButton
                            label={isOutro ? "Outro set" : "Set outro"}
                            size="sm"
                            active={isOutro}
                            isDisabled={tooLongForIntroOutro}
                            tooltip={
                              introOutroDisabledTitle ??
                              "Sets this whole clip as the outro (no range - the entire clip is inserted)"
                            }
                            onClick={() => onSetOutro(card.clipFileName)}
                            data-testid={`palette-card-set-outro-${card.key}`}
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

