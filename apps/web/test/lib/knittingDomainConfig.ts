import type { DomainConfig } from "../../src/lib/domainConfig.js";

/**
 * Mirrors `domains/knitting/categories.json` + shot-types.json's labels + face-policy.json's
 * memoTag - the exact knitting scene-presentation model the server (`GET /api/domain`) serves in
 * production. Shared across web tests (momentCards/sceneInfo/component tests) so the
 * config-threading refactor (issue #31 item 1) keeps asserting the same knitting behavior the old
 * hardcoded maps did.
 */
export const KNITTING_DOMAIN_CONFIG: DomainConfig = {
  shotTypeLabels: {
    "hand-closeup": "Hand",
    object: "Object",
    cat: "Cat",
    change: "Change",
    reveal: "Reveal",
    wearing: "Wearing",
    other: "Other",
  },
  categories: [
    { id: "knit-range", label: "Knit range", color: "teal" },
    { id: "knitting", label: "Knitting", color: "blue" },
    { id: "cat", label: "Cat", color: "purple" },
    { id: "reveal", label: "Reveal", color: "orange" },
    { id: "materials", label: "Materials/props", color: "green" },
    { id: "outing", label: "Outing", color: "yellow" },
    { id: "mistake", label: "Mistake", color: "red" },
    { id: "wearing", label: "Wearing", color: "pink" },
    { id: "change", label: "Change", color: "cyan" },
    { id: "other", label: "Other", color: "neutral" },
  ],
  shotTypeCategory: {
    "hand-closeup": "knitting",
    object: "materials",
    cat: "cat",
    change: "change",
    reveal: "reveal",
    wearing: "wearing",
    other: "other",
  },
  memoPatterns: [
    { category: "mistake", pattern: "풀|실수|다시\\s*뜨" },
    { category: "outing", pattern: "가게|야외|밖에|거리|걷|매장" },
  ],
  rangeCategory: "knit-range",
  faceTag: "[얼굴노출]",
};
