// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { InlineField } from "./InlineField.js";

afterEach(cleanup);

describe("InlineField", () => {
  it("associates the label with its input (label beside input, same line)", () => {
    render(
      <InlineField label="In" inputID="t1">
        <input id="t1" value="2" onChange={() => {}} />
      </InlineField>,
    );
    expect(screen.getByLabelText("In")).toHaveProperty("value", "2");
  });
});
