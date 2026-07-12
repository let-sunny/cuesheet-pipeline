import { describe, expect, it } from "vitest";
import { badgeVariantFor, categoryBadgeVariant, categoryLabel } from "../../src/lib/domainConfig.js";
import { KNITTING_DOMAIN_CONFIG } from "./knittingDomainConfig.js";

describe("badgeVariantFor", () => {
  it("passes a known Astryx Badge variant color through as-is", () => {
    expect(badgeVariantFor("teal")).toBe("teal");
    expect(badgeVariantFor("purple")).toBe("purple");
  });

  it("falls back to 'neutral' for a color Astryx's Badge doesn't know (e.g. a 2nd domain's typo/new color)", () => {
    expect(badgeVariantFor("mauve")).toBe("neutral");
    expect(badgeVariantFor("")).toBe("neutral");
  });
});

describe("categoryLabel / categoryBadgeVariant", () => {
  it("resolves a configured category id to its label and badge variant", () => {
    expect(categoryLabel(KNITTING_DOMAIN_CONFIG, "mistake")).toBe("Mistake");
    expect(categoryBadgeVariant(KNITTING_DOMAIN_CONFIG, "mistake")).toBe("red");
  });

  it("falls back gracefully for a category id not present in the config", () => {
    expect(categoryLabel(KNITTING_DOMAIN_CONFIG, "unknown-category")).toBe("Other");
    expect(categoryBadgeVariant(KNITTING_DOMAIN_CONFIG, "unknown-category")).toBe("neutral");
  });
});
