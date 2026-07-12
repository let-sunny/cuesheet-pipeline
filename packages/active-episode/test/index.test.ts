import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  ACTIVE_DOMAIN_FILENAME,
  ACTIVE_EPISODE_FILENAME,
  DEFAULT_DOMAIN_DIR,
  readActiveDomain,
  readActiveEpisode,
  resolveCuesheetPath,
  resolveDomainDir,
  writeActiveDomain,
  writeActiveEpisode,
} from "../src/index.js";

let repoRoot: string;

beforeEach(() => {
  repoRoot = mkdtempSync(join(tmpdir(), "active-episode-test-"));
});

afterEach(() => {
  rmSync(repoRoot, { recursive: true, force: true });
});

describe("ACTIVE_EPISODE_FILENAME", () => {
  it("is .active-episode", () => {
    expect(ACTIVE_EPISODE_FILENAME).toBe(".active-episode");
  });
});

describe("readActiveEpisode", () => {
  it("returns null when the file doesn't exist", () => {
    expect(readActiveEpisode(repoRoot)).toBeNull();
  });

  it("returns null for an empty file", () => {
    writeActiveEpisode(repoRoot, "");
    expect(readActiveEpisode(repoRoot)).toBeNull();
  });

  it("returns null for a whitespace-only file", () => {
    writeActiveEpisode(repoRoot, "   \n\t  ");
    expect(readActiveEpisode(repoRoot)).toBeNull();
  });

  it("returns the trimmed stored path", () => {
    writeActiveEpisode(repoRoot, "episodes/foo.cuesheet.json");
    expect(readActiveEpisode(repoRoot)).toBe("episodes/foo.cuesheet.json");
  });

  it("tolerates a trailing newline written by writeActiveEpisode", () => {
    writeActiveEpisode(repoRoot, "episodes/foo.cuesheet.json");
    // writeActiveEpisode always newline-terminates; readActiveEpisode must trim it back off.
    expect(readActiveEpisode(repoRoot)).not.toContain("\n");
  });
});

describe("writeActiveEpisode", () => {
  it("writes a single newline-terminated line", () => {
    writeActiveEpisode(repoRoot, "episodes/foo.cuesheet.json");
    const raw = readActiveEpisode(repoRoot);
    expect(raw).toBe("episodes/foo.cuesheet.json");
  });
});

describe("resolveCuesheetPath precedence", () => {
  it("falls back to ./project.cuesheet.json when neither env nor file is set", () => {
    const result = resolveCuesheetPath({ repoRoot, env: {} });
    expect(result).toBe(join(repoRoot, "project.cuesheet.json"));
  });

  it("uses the .active-episode file when env is unset", () => {
    writeActiveEpisode(repoRoot, "episodes/foo.cuesheet.json");
    const result = resolveCuesheetPath({ repoRoot, env: {} });
    expect(result).toBe(join(repoRoot, "episodes/foo.cuesheet.json"));
  });

  it("prefers an explicit CUESHEET_PATH env var over the .active-episode file", () => {
    writeActiveEpisode(repoRoot, "episodes/foo.cuesheet.json");
    const result = resolveCuesheetPath({
      repoRoot,
      env: { CUESHEET_PATH: "episodes/bar.cuesheet.json" },
    });
    expect(result).toBe(join(repoRoot, "episodes/bar.cuesheet.json"));
  });

  it("treats an empty-string CUESHEET_PATH env var as unset (falls through to the file)", () => {
    writeActiveEpisode(repoRoot, "episodes/foo.cuesheet.json");
    const result = resolveCuesheetPath({ repoRoot, env: { CUESHEET_PATH: "" } });
    expect(result).toBe(join(repoRoot, "episodes/foo.cuesheet.json"));
  });

  it("treats a whitespace-only CUESHEET_PATH env var as unset", () => {
    writeActiveEpisode(repoRoot, "episodes/foo.cuesheet.json");
    const result = resolveCuesheetPath({ repoRoot, env: { CUESHEET_PATH: "   " } });
    expect(result).toBe(join(repoRoot, "episodes/foo.cuesheet.json"));
  });

  it("treats a blank .active-episode file as absent (falls through to the default)", () => {
    writeActiveEpisode(repoRoot, "   ");
    const result = resolveCuesheetPath({ repoRoot, env: {} });
    expect(result).toBe(join(repoRoot, "project.cuesheet.json"));
  });

  it("resolves a relative env path against repoRoot", () => {
    const result = resolveCuesheetPath({
      repoRoot,
      env: { CUESHEET_PATH: "custom/path.cuesheet.json" },
    });
    expect(result).toBe(join(repoRoot, "custom/path.cuesheet.json"));
  });

  it("returns an absolute env path unchanged", () => {
    const absolute = join(tmpdir(), "somewhere-else.cuesheet.json");
    const result = resolveCuesheetPath({ repoRoot, env: { CUESHEET_PATH: absolute } });
    expect(result).toBe(absolute);
  });

  it("returns an absolute stored file path unchanged", () => {
    const absolute = join(tmpdir(), "somewhere-else.cuesheet.json");
    writeActiveEpisode(repoRoot, absolute);
    const result = resolveCuesheetPath({ repoRoot, env: {} });
    expect(result).toBe(absolute);
  });
});

describe("active domain", () => {
  it("ACTIVE_DOMAIN_FILENAME is .active-domain", () => {
    expect(ACTIVE_DOMAIN_FILENAME).toBe(".active-domain");
  });

  it("DEFAULT_DOMAIN_DIR is domains/knitting", () => {
    expect(DEFAULT_DOMAIN_DIR).toBe("domains/knitting");
  });

  it("readActiveDomain returns null when the file is missing / blank", () => {
    expect(readActiveDomain(repoRoot)).toBeNull();
    writeActiveDomain(repoRoot, "  \n ");
    expect(readActiveDomain(repoRoot)).toBeNull();
  });

  it("readActiveDomain returns the trimmed stored dir (newline stripped)", () => {
    writeActiveDomain(repoRoot, "domains/cooking");
    expect(readActiveDomain(repoRoot)).toBe("domains/cooking");
  });
});

describe("resolveDomainDir precedence", () => {
  it("falls back to domains/knitting when neither env nor file is set", () => {
    expect(resolveDomainDir({ repoRoot, env: {} })).toBe(join(repoRoot, "domains/knitting"));
  });

  it("uses the .active-domain file when set", () => {
    writeActiveDomain(repoRoot, "domains/cooking");
    expect(resolveDomainDir({ repoRoot, env: {} })).toBe(join(repoRoot, "domains/cooking"));
  });

  it("DOMAIN_DIR env wins over the file", () => {
    writeActiveDomain(repoRoot, "domains/cooking");
    expect(resolveDomainDir({ repoRoot, env: { DOMAIN_DIR: "domains/knitting" } })).toBe(
      join(repoRoot, "domains/knitting"),
    );
  });

  it("treats an empty/whitespace DOMAIN_DIR env as unset (falls through to the file)", () => {
    writeActiveDomain(repoRoot, "domains/cooking");
    expect(resolveDomainDir({ repoRoot, env: { DOMAIN_DIR: "   " } })).toBe(join(repoRoot, "domains/cooking"));
  });

  it("resolves a relative env dir against repoRoot, returns an absolute one unchanged", () => {
    expect(resolveDomainDir({ repoRoot, env: { DOMAIN_DIR: "domains/x" } })).toBe(join(repoRoot, "domains/x"));
    const absolute = join(tmpdir(), "abs-domain");
    expect(resolveDomainDir({ repoRoot, env: { DOMAIN_DIR: absolute } })).toBe(absolute);
  });
});
