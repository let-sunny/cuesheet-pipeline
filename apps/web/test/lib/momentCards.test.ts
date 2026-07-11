import { describe, expect, it } from "vitest";
import type { Segment } from "@cuesheet/schema";
import type { ClipMoments } from "../../src/api.js";
import {
  buildCards,
  computeCategoryCounts,
  computeInUseCutNumbers,
  filterByStatus,
  filterCards,
  hasFaceTag,
  nearestFrame,
  stripFaceTag,
} from "../../src/lib/momentCards.js";

function seg(overrides: Partial<Segment> = {}): Segment {
  return { clip: "a.mp4", in: 0, out: 5, speed: 1, volume: 1, subtitle: "", ...overrides };
}

const fixtures: ClipMoments[] = [
  {
    clip: "/clips/a.mp4",
    clipSummary: "a knitting long-take with a cat cameo",
    moments: [
      { inS: 10, outS: 13, shotType: "hand-closeup", memo: "knitting a sleeve", quality: 4 },
      { inS: 20, outS: 22, shotType: "cat", memo: "the cat walks by", quality: 5 },
      // Face-tag pattern: the vision reader flags a face-exposure risk in the memo.
      { inS: 30, outS: 33, shotType: "wearing", memo: "trying it on [얼굴노출]", quality: 4 },
      // Low quality, no face tag - should be auto-excluded on quality alone.
      { inS: 40, outS: 42, shotType: "object", memo: "yarn on the table", quality: 2 },
      // Mistake pattern overrides the shotType-derived category.
      { inS: 50, outS: 55, shotType: "hand-closeup", memo: "실수해서 풀었다", quality: 3 },
      // Outing pattern overrides the shotType-derived category.
      { inS: 60, outS: 65, shotType: "other", memo: "가게 앞을 걷는다", quality: 3 },
    ],
    monotonousRanges: [{ startS: 100, endS: 140, desc: "long steady knitting" }],
  },
];

describe("buildCards", () => {
  const cards = buildCards(fixtures);

  it("flattens moments and monotonousRanges into one sorted list", () => {
    expect(cards).toHaveLength(7);
    expect(cards.every((c) => c.clipFileName === "a.mp4")).toBe(true);
    // sorted by (clipFileName, inS) - the monotonousRange card's inS is its clamped 3s window
    // (118.5, not the range's raw startS of 100 - see the dedicated test below).
    expect(cards.map((c) => c.inS)).toEqual([10, 20, 30, 40, 50, 60, 118.5]);
  });

  it("classifies a plain shot by its shotType", () => {
    const c = cards.find((c) => c.inS === 10);
    expect(c?.category).toBe("knitting");
  });

  it("the mistake pattern overrides the shotType-derived category", () => {
    const c = cards.find((c) => c.inS === 50);
    expect(c?.category).toBe("mistake");
    expect(c?.memo).toBe("실수해서 풀었다");
  });

  it("the outing pattern overrides the shotType-derived category", () => {
    const c = cards.find((c) => c.inS === 60);
    expect(c?.category).toBe("outing");
  });

  it("a monotonousRange becomes a single ~3s card centered on its own midpoint", () => {
    const rangeCard = cards.find((c) => c.category === "knit-range");
    expect(rangeCard).toBeDefined();
    expect(rangeCard?.inS).toBe(118.5); // midpoint(120) - 1.5
    expect(rangeCard?.outS).toBe(121.5);
    expect(rangeCard?.quality).toBeNull();
  });

  it("clamps the representative window inside a monotonousRange shorter than 3s", () => {
    const shortRangeFixture: ClipMoments[] = [
      {
        clip: "/clips/b.mp4",
        clipSummary: "short clip",
        moments: [],
        monotonousRanges: [{ startS: 10, endS: 11, desc: "short" }],
      },
    ];
    const [card] = buildCards(shortRangeFixture);
    expect(card?.inS).toBe(10); // midpoint(10.5)-1.5=9 clamped up to startS=10
    expect(card?.outS).toBe(11); // midpoint(10.5)+1.5=12 clamped down to endS=11
  });
});

describe("hasFaceTag / stripFaceTag", () => {
  it("detects the face-exposure tag and strips it (trimming the leftover space)", () => {
    expect(hasFaceTag("trying it on [얼굴노출]")).toBe(true);
    expect(hasFaceTag("no risk here")).toBe(false);
    expect(stripFaceTag("trying it on [얼굴노출]")).toBe("trying it on");
  });
});

describe("nearestFrame", () => {
  it("picks the tNNNNN.jpg frame closest to inS", () => {
    const frames = ["t00005.jpg", "t00012.jpg", "t00030.jpg", "not-a-frame.txt"];
    expect(nearestFrame(frames, 13)).toBe("t00012.jpg");
    expect(nearestFrame(frames, 1)).toBe("t00005.jpg");
  });

  it("returns null when there are no matching frame files", () => {
    expect(nearestFrame(["readme.md"], 5)).toBeNull();
    expect(nearestFrame([], 5)).toBeNull();
  });
});

describe("computeCategoryCounts", () => {
  it("counts cards per category", () => {
    const cards = buildCards(fixtures);
    const counts = computeCategoryCounts(cards);
    expect(counts.get("knitting")).toBe(1);
    expect(counts.get("cat")).toBe(1);
    expect(counts.get("mistake")).toBe(1);
    expect(counts.get("outing")).toBe(1);
    expect(counts.get("knit-range")).toBe(1);
  });
});

describe("computeInUseCutNumbers", () => {
  it("maps a card to its 1-based cut number when an added segment overlaps its range", () => {
    const cards = buildCards(fixtures);
    const catCard = cards.find((c) => c.inS === 20)!;
    const segments = [seg({ in: 0, out: 5 }), seg({ in: 20, out: 22 })];
    const map = computeInUseCutNumbers(cards, segments);
    expect(map.get(catCard.key)).toBe(2);
  });

  it("does not mark a card in-use when no segment overlaps it", () => {
    const cards = buildCards(fixtures);
    const map = computeInUseCutNumbers(cards, []);
    expect(map.size).toBe(0);
  });
});

describe("filterCards", () => {
  const cards = buildCards(fixtures);

  it("'all' category and 'all' status returns every card", () => {
    expect(filterCards(cards, "all", "all", new Map())).toHaveLength(cards.length);
  });

  it("filters down to a single category", () => {
    expect(filterCards(cards, "cat", "all", new Map())).toHaveLength(1);
  });

  it("'in-use' keeps only cards present in the inUseCutNumber map", () => {
    const catCard = cards.find((c) => c.inS === 20)!;
    const inUse = new Map([[catCard.key, 1]]);
    const result = filterCards(cards, "all", "in-use", inUse);
    expect(result).toHaveLength(1);
    expect(result[0]?.key).toBe(catCard.key);
  });

  it("'excluded' keeps only not-in-use cards with a face tag or quality < 3", () => {
    const result = filterCards(cards, "all", "excluded", new Map());
    // face-tagged (inS=30, quality 4) + low-quality (inS=40, quality 2) qualify;
    // the mistake card (quality 3, no face tag) does not (3 is not < 3).
    expect(result.map((c) => c.inS).sort((a, b) => a - b)).toEqual([30, 40]);
  });

  it("'excluded' never includes a card that is in use, even if it'd otherwise qualify", () => {
    const faceCard = cards.find((c) => c.inS === 30)!;
    const inUse = new Map([[faceCard.key, 1]]);
    const result = filterCards(cards, "all", "excluded", inUse);
    expect(result.some((c) => c.key === faceCard.key)).toBe(false);
  });
});

describe("filterByStatus + faceted category counts", () => {
  const cards = buildCards(fixtures);
  const noneInUse = new Map<string, number>();

  it("counts categories over the status-filtered set, so a category with no matches reads 0", () => {
    // Under "Excluded only", only the face-tagged (wearing) and low-quality (materials) cards
    // qualify. A category with no excluded card (e.g. cat, quality 5, no face) must NOT appear in
    // the counts - this is the fix for the user-facing bug where "Wearing (4)" showed nothing once
    // "Excluded only" was active: the chip count has to reflect the active status filter.
    const excludedOnly = filterByStatus(cards, "excluded", noneInUse);
    const counts = computeCategoryCounts(excludedOnly);
    expect(counts.get("wearing")).toBe(1); // the [얼굴노출] card
    expect(counts.get("materials")).toBe(1); // the quality-2 object card
    expect(counts.get("cat")).toBeUndefined(); // quality 5, no face - not excluded, so 0
    expect(counts.get("knitting")).toBeUndefined();
    // And the count matches what filterCards actually renders for that category.
    expect(filterCards(cards, "cat", "excluded", noneInUse).length).toBe(0);
    expect(filterCards(cards, "wearing", "excluded", noneInUse).length).toBe(1);
  });
});
