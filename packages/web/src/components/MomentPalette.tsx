import { useEffect, useMemo, useState } from "react";
import type { Segment } from "@cuesheet/schema";
import { fetchDraftFrames, fetchMoments } from "../api.js";
import type { ClipMoments, ShotType } from "../api.js";
import { INTRO_OUTRO_MAX_DURATION_S, baseName, buildClipPath, computeClipDurations, stem } from "../clipPaths.js";

type Category =
  | "뜨개구간"
  | "뜨개"
  | "고양이"
  | "리빌"
  | "재료·소품"
  | "외출"
  | "실수"
  | "착용"
  | "변화"
  | "기타";

interface MomentCard {
  key: string;
  clipFileName: string;
  clipFolder: string;
  inS: number;
  outS: number;
  category: Category;
  memo: string;
}

const SHOT_TYPE_CATEGORY: Record<ShotType, Category> = {
  "hand-closeup": "뜨개",
  object: "재료·소품",
  cat: "고양이",
  change: "변화",
  reveal: "리빌",
  wearing: "착용",
  other: "기타",
};

const CATEGORY_META: Record<Category, { label: string; className: string }> = {
  "뜨개구간": { label: "뜨개구간", className: "knit-range" },
  "뜨개": { label: "뜨개", className: "knit" },
  "고양이": { label: "고양이", className: "cat" },
  "리빌": { label: "리빌", className: "reveal" },
  "재료·소품": { label: "재료·소품", className: "object" },
  "외출": { label: "외출", className: "outing" },
  "실수": { label: "실수", className: "mistake" },
  "착용": { label: "착용", className: "wearing" },
  "변화": { label: "변화", className: "change" },
  "기타": { label: "기타", className: "other" },
};

const CATEGORY_ORDER: Category[] = [
  "뜨개구간",
  "뜨개",
  "고양이",
  "리빌",
  "재료·소품",
  "외출",
  "실수",
  "착용",
  "변화",
  "기타",
];

const MISTAKE_PATTERN = /풀|실수|다시\s*뜨/;
const OUTING_PATTERN = /가게|야외|밖에|거리|걷|매장/;

function categoryFor(shotType: ShotType, memo: string): Category {
  if (MISTAKE_PATTERN.test(memo)) {
    return "실수";
  }
  if (OUTING_PATTERN.test(memo)) {
    return "외출";
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
        category: "뜨개구간",
        memo: r.desc,
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
  const [selectedCategory, setSelectedCategory] = useState<Category | "전체">("전체");
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

  const filtered =
    selectedCategory === "전체" ? cards : cards.filter((c) => c.category === selectedCategory);

  const handleAdd = (card: MomentCard) => {
    const seg: Segment = {
      clip: card.clipFileName,
      in: card.inS,
      out: card.outS,
      speed: 1,
      volume: 1,
      subtitle: card.memo,
    };
    onAddSegment(seg);
  };

  if (loadError) {
    return <div className="moment-palette status">순간 데이터를 불러오지 못했습니다: {loadError}</div>;
  }
  if (!moments) {
    return <div className="moment-palette status">순간 데이터를 불러오는 중…</div>;
  }

  return (
    <div className="moment-palette">
      <div className="moment-palette-header">
        <span>{cards.length}개 순간</span>
        <button type="button" onClick={() => setCollapsed((v) => !v)}>
          {collapsed ? "펼치기" : "접기"}
        </button>
      </div>

      {collapsed ? null : (
        <>
          <div className="moment-filters">
            <button
              type="button"
              className={selectedCategory === "전체" ? "active" : ""}
              onClick={() => setSelectedCategory("전체")}
            >
              전체 ({cards.length})
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

          <div className="moment-grid">
            {filtered.map((card) => {
              const meta = CATEGORY_META[card.category];
              const frames = frameMap[card.clipFolder] ?? [];
              const frame = nearestFrame(frames, card.inS);
              const cutNumber = inUseCutNumber.get(card.key);
              const inUse = cutNumber !== undefined;
              // 카드 자체엔 축약된 클립명·시각만 보이고, 판단에 필요한 전체 정보
              // (원본 파일명·구간·카테고리·메모)는 title 툴팁으로 전달한다.
              const fullInfo = `${card.clipFileName} · ${card.inS.toFixed(1)}s~${card.outS.toFixed(1)}s · ${meta.label} · ${card.memo}`;

              // 인트로/아웃트로는 in/out 구간 지정이 안 되는 통짜 클립 삽입이라
              // 이 카드가 속한 클립 파일 전체 길이(근사치)가 상한을 넘으면 지정을 막는다.
              const clipDurationS = clipDurations[card.clipFileName];
              const tooLongForIntroOutro =
                clipDurationS === undefined || clipDurationS > INTRO_OUTRO_MAX_DURATION_S;
              const cardClipPath = buildClipPath(clipDir, card.clipFileName);
              const isIntro = introPath === cardClipPath;
              const isOutro = outroPath === cardClipPath;
              const introOutroDisabledTitle = tooLongForIntroOutro
                ? `15초를 넘는 클립(추정 ${clipDurationS?.toFixed(1) ?? "?"}s)은 인트로/아웃트로로 쓸 수 없습니다 — 구간 지정 없이 클립 전체가 통째로 삽입되므로 짧은 클립에만 적합합니다.`
                : null;
              return (
                <div
                  className={`moment-card${inUse ? " in-use" : ""}`}
                  key={card.key}
                  title={fullInfo}
                >
                  <div className="moment-thumb">
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
                    {inUse ? <span className="moment-badge-in-use">컷 {cutNumber}</span> : null}
                  </div>
                  <div className="moment-info">
                    <span className={`category-tag cat-${meta.className}`}>{meta.label}</span>
                    <span className="moment-duration">{(card.outS - card.inS).toFixed(1)}s</span>
                  </div>
                  {/* -webkit-line-clamp가 걸린 요소가 이 flex-column 카드의 "직속" flex
                      아이템이면(이 환경 Chromium 실측) 클램프 높이 계산이 어긋나 3번째
                      줄이 잘리다 만 채로 버튼 위에 흘러넘친다 — 플레인 래퍼로 한 겹
                      감싸 line-clamp 요소 자체는 flex 아이템이 되지 않게 한다. */}
                  <div className="moment-memo-wrap">
                    <div className="moment-memo" title={card.memo}>
                      {card.memo}
                    </div>
                  </div>
                  <div className="moment-card-actions">
                    <button
                      type="button"
                      className="moment-add-button"
                      disabled={inUse}
                      onClick={() => handleAdd(card)}
                    >
                      {inUse ? "담김" : "담기"}
                    </button>
                    {/* 사용 안 중일 땐 빼기를 숨기되(disabled+placeholder) 자리는 그대로
                        차지해 카드 높이가 담기/빼기 유무와 무관하게 일정하게 유지된다. */}
                    <button
                      type="button"
                      className={`moment-remove-button${inUse ? "" : " placeholder"}`}
                      disabled={!inUse}
                      onClick={() => onRemoveSegment(card.clipFileName, card.inS, card.outS)}
                    >
                      빼기
                    </button>
                  </div>
                  <div className="moment-io-actions">
                    <button
                      type="button"
                      className={`moment-io-button${isIntro ? " active" : ""}`}
                      disabled={tooLongForIntroOutro}
                      title={
                        introOutroDisabledTitle ??
                        "이 클립 전체를 인트로로 지정합니다(구간 지정 불가, 클립 전체 삽입)"
                      }
                      onClick={() => onSetIntro(card.clipFileName)}
                    >
                      {isIntro ? "인트로 지정됨" : "인트로로"}
                    </button>
                    <button
                      type="button"
                      className={`moment-io-button${isOutro ? " active" : ""}`}
                      disabled={tooLongForIntroOutro}
                      title={
                        introOutroDisabledTitle ??
                        "이 클립 전체를 아웃트로로 지정합니다(구간 지정 불가, 클립 전체 삽입)"
                      }
                      onClick={() => onSetOutro(card.clipFileName)}
                    >
                      {isOutro ? "아웃트로 지정됨" : "아웃트로로"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
