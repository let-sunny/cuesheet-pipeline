// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { __NAME__ } from "./__NAME__.js";

afterEach(cleanup);

describe("__NAME__", () => {
  it("renders", () => {
    render(<__NAME__ />);
    expect(screen.getByTestId("__TEST_ID__")).not.toBeNull();
  });
});
