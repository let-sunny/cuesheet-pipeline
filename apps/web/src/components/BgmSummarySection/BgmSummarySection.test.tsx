// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { BgmSummarySection } from "./BgmSummarySection.js";

afterEach(cleanup);

describe("BgmSummarySection", () => {
  it("pluralizes 'track' for a count of 1", () => {
    render(<BgmSummarySection trackCount={1} />);
    expect(screen.getByText(/1 track\b/)).not.toBeNull();
  });

  it("pluralizes 'tracks' for any other count", () => {
    const { rerender } = render(<BgmSummarySection trackCount={0} />);
    expect(screen.getByText(/0 tracks/)).not.toBeNull();
    rerender(<BgmSummarySection trackCount={3} />);
    expect(screen.getByText(/3 tracks/)).not.toBeNull();
  });
});
