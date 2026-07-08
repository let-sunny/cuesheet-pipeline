import { useEffect, useMemo, useState } from "react";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Badge } from "@astryxdesign/core/Badge";
import type { BadgeVariant } from "@astryxdesign/core/Badge";
import { Text } from "@astryxdesign/core/Text";
import type { Segment } from "@cuesheet/schema";
import { fetchDraftFrames, fetchMoments } from "../api.js";
import type { ClipMoments, ShotType } from "../api.js";
import { INTRO_OUTRO_MAX_DURATION_S, baseName, buildClipPath, computeClipDurations, stem } from "../clipPaths.js";

type Category =
  | "knit-range"
  | "knitting"
  | "cat"
  | "reveal"
  | "materials"
  | "outing"
  | "mistake"
  | "wearing"
  | "change"
  | "other";

interface MomentCard {
  key: string;
  clipFileName: string;
  clipFolder: string;
  inS: number;
  outS: number;
  category: Category;
  memo: string;
  /** moments 항목만 값이 있음(monotonousRanges엔 품질 점수 개념이 없음). */
  quality: number | null;
}

/** 비전 판독자가 memo/desc에 남기는 얼굴 노출 위험 태그. 화면 표시에선 배지로
 * 대체하고 원문 텍스트는 제거한다(자막으로도 새 나가지 않게).
 * 이 태그는 생성된(한국어) 데이터 안에 실제로 박혀 있는 문자열이라 번역하지 않는다 —
 * UI 라벨이 아니라 콘텐츠 매칭 마커다. */
const FACE_TAG = "[얼굴노출]";

function hasFaceTag(memo: string): boolean {
  return memo.includes(FACE_TAG);
}

function stripFaceTag(memo: string): string {
  return memo.replace(FACE_TAG, "").trim();
}

const SHOT_TYPE_CATEGORY: Record<ShotType, Category> = {
  "hand-closeup": "knitting",
  object: "materials",
  cat: "cat",
  change: "change",
  reveal: "reveal",
  wearing: "wearing",
  other: "other",
};

/** 카테고리 -> Badge variant. 기존 styles.css category-tag 색 의도를 그대로
 * 보존해 매핑(knit-range=teal, knitting=blue, cat=purple, materials=green, mistake=red,
 * wearing=pink, change=cyan, other=gray는 기존 커스텀 태그와 1:1). reveal/outing은 기존에
 * category-tag 전용 커스텀 색(각각 tag-reveal, tag-outing 변수)이었는데 Badge
 * 팔레트엔 그 두 색이 없어 남는 orange/yellow로 접었다. */
const CATEGORY_META: Record<Category, { label: string; badgeVariant: BadgeVariant }> = {
  "knit-range": { label: "Knit range", badgeVariant: "teal" },
  "knitting": { label: "Knitting", badgeVariant: "blue" },
  "cat": { label: "Cat", badgeVariant: "purple" },
  "reveal": { label: "Reveal", badgeVariant: "orange" },
  "materials": { label: "Materials/props", badgeVariant: "green" },
  "outing": { label: "Outing", badgeVariant: "yellow" },
  "mistake": { label: "Mistake", badgeVariant: "red" },
  "wearing": { label: "Wearing", badgeVariant: "pink" },
  "change": { label: "Change", badgeVariant: "cyan" },
  // BadgeVariantMap에는 gray가 없어(neutral/info/success/warning/error/blue/cyan/
  // green/orange/pink/purple/red/teal/yellow만 존재) 가장 가까운 neutral로 대체.
  "other": { label: "Other", badgeVariant: "neutral" },
};

type StatusFilter = "all" | "in-use" | "excluded";

/* 화면에 보이는 문구(PRD 4절 용어 사전, "[All / In use only / Excluded only]"). */
const STATUS_FILTER_LABEL: Record<StatusFilter, string> = {
  "all": "All",
  "in-use": "In use only",
  "excluded": "Excluded only",
};

const CATEGORY_ORDER: Category[] = [
  "knit-range",
  "knitting",
  "cat",
  "reveal",
  "materials",
  "outing",
  "mistake",
  "wearing",
  "change",
  "other",
];

const MISTAKE_PATTERN = /풀|실수|다시\s*뜨/;
const OUTING_PATTERN = /가게|야외|밖에|거리|걷|매장/;

function categoryFor(shotType: ShotType, memo: string): Category {
  if (MISTAKE_PATTERN.test(memo)) {
    return "mistake";
  }
  if (OUTING_PATTERN.test(memo)) {
    return "outing";
  }
  return SHOT_TYPE_CATEGORY[shotType];
}

/** inS에 가장 가까운 tNNNNN.jpg 프레임 파일명을 고른다. */
function nearestFrame(frames: string[], inS: number): string | null {
  let best: string | null = null;
  let bestDiff = Infinity;
  for (const f of frames) {
    const m = /^t(\d+)\.jpg$/.exec(f);
    const secStr = m?.[1];
    if (!secStr) {
      continue;
    }
    const diff = Math.abs(parseInt(secStr, 10) - inS);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = f;
    }
  }
  return best;
}

function buildCards(entries: ClipMoments[]): MomentCard[] {
  const list: MomentCard[] = [];
  for (const entry of entries) {
    const clipFileName = baseName(entry.clip);
    const clipFolder = stem(clipFileName);
    for (const m of entry.moments) {
      list.push({
        key: `${clipFileName}::m::${m.inS}::${m.outS}`,
        clipFileName,
        clipFolder,
        inS: m.inS,
        outS: m.outS,
        category: categoryFor(m.shotType, m.memo),
        memo: m.memo,
        quality: m.quality,
      });
    }
    for (const r of entry.monotonousRanges) {
      const center = (r.startS + r.endS) / 2;
      const inS = Math.max(r.startS, center - 1.5);
      const outS = Math.min(r.endS, center + 1.5);
      list.push({
        key: `${clipFileName}::range::${r.startS}::${r.endS}`,
        clipFileName,
        clipFolder,
        inS,
        outS,
        category: "knit-range",
        memo: r.desc,
        quality: null,
      });
    }
  }
  list.sort((a, b) => {
    if (a.clipFileName !== b.clipFileName) {
      return a.clipFileName < b.clipFileName ? -1 : 1;
    }
    return a.inS - b.inS;
  });
  return list;
}

interface Props {
  segments: Segment[];
  clipDir: string;
  introPath: string | null;
  outroPath: string | null;
  onAddSegment: (seg: Segment) => void;
  /** 이미 담긴("사용 중") 카드의 "빼기" — 겹치는 세그먼트를 draft에서 제거한다. */
  onRemoveSegment: (clip: string, inS: number, outS: number) => void;
  /** 이 클립 파일 전체를 인트로/아웃트로로 지정한다(구간 무시, 통짜 클립). */
  onSetIntro: (clipFileName: string) => void;
  onSetOutro: (clipFileName: string) => void;
}

/**
 * 초벌 분류된 "순간" 카드들을 카테고리별로 진열해 놓고 클릭 한 번으로
 * 담게 하는 팔레트. 담긴 세그먼트는 놓는 위치와 상관없이 (clip, in) 기준
 * 시간순으로 자동 삽입된다(호출자인 App.tsx가 그 순서를 보장).
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

  // 클립별 길이 근사치(초) — 인트로/아웃트로 지정 버튼의 15초 상한 판정에 쓴다.
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
    // moments가 로드된 뒤 한 번만 프레임 목록을 채운다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moments]);

  const counts = useMemo(() => {
    const m = new Map<Category, number>();
    for (const c of cards) {
      m.set(c.category, (m.get(c.category) ?? 0) + 1);
    }
    return m;
  }, [cards]);

  // 카드가 "사용 중"인지 + 그렇다면 몇 번 컷(타임라인 세그먼트 순번, 1부터)에
  // 담겼는지. 구성↔편집 단계 간 같은 컷을 같은 번호로 추적할 수 있게 한다.
  const inUseCutNumber = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of cards) {
      const idx = segments.findIndex(
        (s) => s.clip === c.clipFileName && s.in < c.outS && s.out > c.inS,
      );
      if (idx !== -1) {
        map.set(c.key, idx + 1);
      }
    }
    return map;
  }, [cards, segments]);

  const byCategory =
    selectedCategory === "all" ? cards : cards.filter((c) => c.category === selectedCategory);

  const filtered = byCategory.filter((c) => {
    if (statusFilter === "all") {
      return true;
    }
    const inUse = inUseCutNumber.has(c.key);
    if (statusFilter === "in-use") {
      return inUse;
    }
    // excluded: 자동 조립에서 채택되지 않았고(inUse 아님), 품질 미달이거나 얼굴 노출로
    // 걸러진 카드만.
    if (inUse) {
      return false;
    }
    return hasFaceTag(c.memo) || (c.quality !== null && c.quality < 3);
  });

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
        <button type="button" onClick={() => setCollapsed((v) => !v)}>
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
              className={selectedCategory === "all" ? "active" : ""}
              onClick={() => setSelectedCategory("all")}
            >
              All ({cards.length})
            </button>
            {CATEGORY_ORDER.filter((cat) => (counts.get(cat) ?? 0) > 0).map((cat) => (
              <button
                type="button"
                key={cat}
                className={selectedCategory === cat ? "active" : ""}
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
                className={statusFilter === f ? "active" : ""}
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
              // 카드 자체엔 축약된 클립명·시각만 보이고, 판단에 필요한 전체 정보
              // (원본 파일명·구간·카테고리·메모)는 title 툴팁으로 전달한다.
              const fullInfo = `${card.clipFileName} · ${card.inS.toFixed(1)}s~${card.outS.toFixed(1)}s · ${meta.label} · ${displayMemo}`;

              // 인트로/아웃트로는 in/out 구간 지정이 안 되는 통짜 클립 삽입이라
              // 이 카드가 속한 클립 파일 전체 길이(근사치)가 상한을 넘으면 지정을 막는다.
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
                // Card(BaseProps)는 title을 명시적으로 omit하므로(footgun 목록) 카드
                // 전체 정보 툴팁은 이 플레인 래퍼 div가 대신 맡는다.
                <div className="moment-card-wrap" key={card.key} title={fullInfo}>
                  <Card
                    padding={0}
                    className={`moment-card${inUse ? " in-use" : ""}${statusClass}`}
                  >
                    {/* 자동 제외 사유는 카드 맨 위 전폭 배너로 - 썸네일 위 작은 코너 배지보다
                        훨씬 눈에 띄어 "흐린 게 뭐고 찐한 게 뭐냐"는 오독을 없앤다(피드백
                        2026-07-08). 담기 버튼은 이 상태에서도 계속 활성 - 자동 제외는
                        "금지"가 아니라 "자동이 거른 것"이라 언제든 되살릴 수 있음을 보여준다. */}
                    {rejectedLabel ? (
                      <div className={`moment-status-banner${faceRejected ? " face" : " quality"}`}>
                        {rejectedLabel}
                      </div>
                    ) : null}
                    <div className={`moment-thumb${rejectedLabel ? " rejected" : ""}`}>
                      {frame ? (
                        <img
                          src={`/draft-frames/${encodeURIComponent(card.clipFolder)}/${encodeURIComponent(frame)}`}
                          alt=""
                        />
                      ) : (
                        <div className="moment-thumb-empty" />
                      )}
                      <span className="moment-number">
                        {card.clipFolder} · {card.inS.toFixed(1)}s
                      </span>
                      {/* Thumbnail(Astryx)은 정사각형 고정+오버레이 슬롯이 없어(children prop
                          자체가 없음) 이 3중 오버레이(번호칩·상태배지·이미지) 합성엔 안 맞아
                          커스텀 유지 — 상태 배지 자체는 Badge로 교체. */}
                      {inUse ? (
                        <Badge
                          variant="success"
                          label={`In use - cut ${cutNumber}`}
                          className="moment-badge-in-use"
                        />
                      ) : null}
                    </div>
                    {/* 카드 위계(screen-spec 2절): 썸네일 -> 상태 배지(위, 썸네일 오버레이) ->
                        장면 설명(전문, 줄바꿈 허용) -> 메타(샷유형·길이·품질) -> 액션. 이
                        화면은 장면을 "읽고 고르는" 화면이라 설명 클램프는 제거했다
                        (maxLines={0} = 무클램프). 카드 내부 간격 규칙(screen-spec 0-1/0-2):
                        일관 패딩 12px + 그룹(설명/메타/액션) 간 명확한 gap을
                        .moment-card-body가 전담한다. */}
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
                        <div className="moment-card-actions">
                          <Button
                            label={inUse ? "Added" : "Add"}
                            variant="primary"
                            size="sm"
                            isDisabled={inUse}
                            onClick={() => handleAdd(card)}
                          />
                          {/* 사용 안 중일 땐 빼기를 숨기되(자리는 그대로 차지해 카드 높이가
                              담기/빼기 유무와 무관하게 일정하게 유지된다). */}
                          <Button
                            label="Remove"
                            variant="destructive"
                            size="sm"
                            isDisabled={!inUse}
                            className={inUse ? "" : "placeholder"}
                            onClick={() => onRemoveSegment(card.clipFileName, card.inS, card.outS)}
                          />
                        </div>
                        <div className="moment-io-actions">
                          <Button
                            label={isIntro ? "Intro set" : "Set as intro"}
                            variant="ghost"
                            size="sm"
                            className={`moment-io-button${isIntro ? " active" : ""}`}
                            isDisabled={tooLongForIntroOutro}
                            tooltip={
                              introOutroDisabledTitle ??
                              "Sets this whole clip as the intro (no range - the entire clip is inserted)"
                            }
                            onClick={() => onSetIntro(card.clipFileName)}
                          />
                          <Button
                            label={isOutro ? "Outro set" : "Set as outro"}
                            variant="ghost"
                            size="sm"
                            className={`moment-io-button${isOutro ? " active" : ""}`}
                            isDisabled={tooLongForIntroOutro}
                            tooltip={
                              introOutroDisabledTitle ??
                              "Sets this whole clip as the outro (no range - the entire clip is inserted)"
                            }
                            onClick={() => onSetOutro(card.clipFileName)}
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
