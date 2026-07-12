import { loadDomainBundle } from "@cuesheet/draft";
import type { ViteDevServer } from "vite";
import type { DomainConfig } from "../../lib/domainConfig.js";
import { NEUTRAL_DOMAIN_CONFIG } from "../../lib/domainConfig.js";
import { domainDir, sendJson } from "../shared.js";

/**
 * Registers GET /api/domain: the active domain's scene-presentation model (labels, categories,
 * shot->category map, memo patterns, face tag) that the web palette/edit views render from, instead
 * of hardcoding the knitting vocabulary (issue #31 item 1). Reads the active domain bundle via
 * `@cuesheet/draft`; on any failure (missing bundle, no categories.json) it serves the neutral
 * fallback so the editor still renders rather than 500-ing.
 */
export function registerDomainRoute(server: ViteDevServer): void {
  server.middlewares.use("/api/domain", (req, res) => {
    if (req.method !== "GET") {
      res.statusCode = 405;
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.end("Method not allowed");
      return;
    }
    sendJson(res, 200, resolveDomainConfig());
  });
}

/** Builds the wire config from the active domain bundle, falling back to neutral on any error. */
function resolveDomainConfig(): DomainConfig {
  try {
    const bundle = loadDomainBundle(domainDir());
    const categories = bundle.categories;
    if (!categories) {
      return { ...NEUTRAL_DOMAIN_CONFIG, shotTypeLabels: bundle.shotTypeLabels, faceTag: bundle.facePolicy.memoTag };
    }
    return {
      shotTypeLabels: bundle.shotTypeLabels,
      categories: categories.categories,
      shotTypeCategory: categories.shotTypeCategory,
      memoPatterns: categories.memoPatterns,
      rangeCategory: categories.rangeCategory,
      faceTag: bundle.facePolicy.memoTag,
    };
  } catch {
    return NEUTRAL_DOMAIN_CONFIG;
  }
}
