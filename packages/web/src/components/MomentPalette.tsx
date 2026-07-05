import { useEffect, useMemo, useState } from "react";
import type { Segment } from "@cuesheet/schema";
import { fetchDraftFrames, fetchMoments } from "../api.js";
import type { ClipMoments, ShotType } from "../api.js";

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

interface NumberedCard extends MomentCard {
  number: number;
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

/** node:path 없이 브라우저에서 파일명만 뽑아낸다(경로 구분자 둘 다 대응). */
function baseName(path: string): string {
  const idx = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return idx === -1 ? path : path.slice(idx + 1);
}

/** 확장자를 뗀 파일명 — 프레임 폴더명과 일치시키는 데 쓴다. */
function stem(fileName: string): string {
  const idx = fileName.lastIndexOf(".");
  return idx === -1 ? fileName : fileName.slice(0, idx);
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

function buildCards(entries: ClipMoments[]): NumberedCard[] {
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
  return list.map((c, i) => ({ ...c, number: i + 1 }));
}

interface Props {
  segments: Segment[];
  onAddSegment: (seg: Segment) => void;
}

/**
 * 초벌 분류된 "순간" 카드들을 카테고리별로 진열해 놓고 클릭 한 번으로
 * 담게 하는 팔레트. 담긴 세그먼트는 놓는 위치와 상관없이 (clip, in) 기준
 * 시간순으로 자동 삽입된다(호출자인 App.tsx가 그 순서를 보장).
 */
export function MomentPalette({ segments, onAddSegment }: Props) {
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

  const inUseKeys = useMemo(() => {
    const set = new Set<string>();
    for (const c of cards) {
      const inUse = segments.some(
        (s) => s.clip === c.clipFileName && s.in < c.outS && s.out > c.inS,
      );
      if (inUse) {
        set.add(c.key);
      }
    }
    return set;
  }, [cards, segments]);

  const filtered =
    selectedCategory === "전체" ? cards : cards.filter((c) => c.category === selectedCategory);

  const handleAdd = (card: NumberedCard) => {
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
              const inUse = inUseKeys.has(card.key);
              return (
                <div className={`moment-card${inUse ? " in-use" : ""}`} key={card.key}>
                  <div className="moment-thumb">
                    {frame ? (
                      <img
                        src={`/draft-frames/${encodeURIComponent(card.clipFolder)}/${encodeURIComponent(frame)}`}
                        alt=""
                      />
                    ) : (
                      <div className="moment-thumb-empty" />
                    )}
                    <span className="moment-number">#{card.number}</span>
                    {inUse ? <span className="moment-badge-in-use">사용 중</span> : null}
                  </div>
                  <div className="moment-info">
                    <span className={`category-tag cat-${meta.className}`}>{meta.label}</span>
                    <span className="moment-duration">{(card.outS - card.inS).toFixed(1)}s</span>
                  </div>
                  <div className="moment-memo" title={card.memo}>
                    {card.memo}
                  </div>
                  <button type="button" className="moment-add-button" onClick={() => handleAdd(card)}>
                    담기
                  </button>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
