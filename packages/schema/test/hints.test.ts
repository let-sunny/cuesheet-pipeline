import type { z } from "zod";
import { describe, expect, it } from "vitest";
import { deriveHint } from "../src/hints.js";

/** Builds a minimal too_big/too_small issue for a given code, bound, and inclusiveness. */
function boundIssue(
  code: "too_big" | "too_small",
  bound: number,
  inclusive: boolean,
): z.core.$ZodIssue {
  const base = {
    origin: "number" as const,
    path: ["speed"],
    message: "irrelevant for hint derivation",
    input: 999,
  };
  return code === "too_big"
    ? { ...base, code, maximum: bound, inclusive }
    : { ...base, code, minimum: bound, inclusive };
}

function customIssue(
  path: PropertyKey[],
  message: string,
  input: unknown,
): z.core.$ZodIssue {
  return { code: "custom", path, message, input };
}

describe("deriveHint - numeric bounds", () => {
  it("suggests clamping to the maximum when too_big and inclusive", () => {
    expect(deriveHint(boundIssue("too_big", 16, true))).toBe("clamp to 16");
  });

  it("gives no hint when too_big and exclusive (the bound itself isn't legal)", () => {
    expect(deriveHint(boundIssue("too_big", 16, false))).toBeUndefined();
  });

  it("suggests clamping to the minimum when too_small and inclusive", () => {
    expect(deriveHint(boundIssue("too_small", 0, true))).toBe("clamp to 0");
  });

  it("gives no hint when too_small and exclusive (the bound itself isn't legal)", () => {
    expect(deriveHint(boundIssue("too_small", 0, false))).toBeUndefined();
  });

  it("gives no hint when the bound isn't a plain number (e.g. bigint)", () => {
    expect(
      deriveHint({
        origin: "bigint",
        code: "too_big",
        maximum: 10n,
        inclusive: true,
        path: ["x"],
        message: "irrelevant",
      }),
    ).toBeUndefined();
  });
});

describe("deriveHint - even width/height", () => {
  it("suggests the two nearest even values for an odd width", () => {
    expect(deriveHint(customIssue(["project", "width"], "must be even for video encoding", 1921))).toBe(
      "round to nearest even (1920 or 1922)",
    );
  });

  it("suggests the two nearest even values for an odd height", () => {
    expect(deriveHint(customIssue(["project", "height"], "must be even for video encoding", 1081))).toBe(
      "round to nearest even (1080 or 1082)",
    );
  });

  it("gives no hint when the field isn't width/height", () => {
    expect(deriveHint(customIssue(["project", "fps"], "must be even for video encoding", 31))).toBeUndefined();
  });

  it("gives no hint when the input isn't a number (reportInput not set)", () => {
    expect(deriveHint(customIssue(["project", "width"], "must be even for video encoding", undefined))).toBeUndefined();
  });
});

describe("deriveHint - segment in/out swap", () => {
  it("suggests swapping in/out when in > out", () => {
    expect(
      deriveHint(
        customIssue(["segments", 0, "in"], "in must be less than out (in < out)", { in: 5, out: 3 }),
      ),
    ).toBe("swap to in=3, out=5");
  });

  it("gives no hint when in === out (swapping wouldn't fix it)", () => {
    expect(
      deriveHint(
        customIssue(["segments", 0, "in"], "in must be less than out (in < out)", { in: 3, out: 3 }),
      ),
    ).toBeUndefined();
  });

  it("gives no hint when the path doesn't end in \"in\"", () => {
    expect(
      deriveHint(
        customIssue(["segments", 0, "out"], "in must be less than out (in < out)", { in: 5, out: 3 }),
      ),
    ).toBeUndefined();
  });

  it("gives no hint when the input shape doesn't carry numeric in/out (reportInput not set)", () => {
    expect(
      deriveHint(customIssue(["segments", 0, "in"], "in must be less than out (in < out)", undefined)),
    ).toBeUndefined();
  });
});

describe("deriveHint - failures needing human judgment", () => {
  it("gives no hint for an unrelated custom issue (e.g. unknown stylePreset name)", () => {
    expect(
      deriveHint(
        customIssue(
          ["segments", 0, "stylePreset"],
          'stylePreset "shout" does not reference an existing preset name',
          "shout",
        ),
      ),
    ).toBeUndefined();
  });

  it("gives no hint for a shape error (invalid_type)", () => {
    expect(
      deriveHint({
        code: "invalid_type",
        expected: "number",
        path: ["speed"],
        message: "Expected number, received string",
      }),
    ).toBeUndefined();
  });

  it("gives no hint for an unrecognized-keys shape error", () => {
    expect(
      deriveHint({
        code: "unrecognized_keys",
        keys: ["bogus"],
        path: [],
        message: "Unrecognized key: bogus",
      }),
    ).toBeUndefined();
  });
});
