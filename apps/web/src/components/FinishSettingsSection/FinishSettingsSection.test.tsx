// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { FinishSettingsSection } from "./FinishSettingsSection.js";

afterEach(cleanup);

describe("FinishSettingsSection", () => {
  it("renders the heading, description, and fields", () => {
    render(
      <FinishSettingsSection heading="Project" description="Episode-wide settings." data-testid="a-section">
        <p>a field</p>
      </FinishSettingsSection>,
    );
    expect(screen.getByRole("heading", { level: 3, name: "Project" })).not.toBeNull();
    expect(screen.getByText("Episode-wide settings.")).not.toBeNull();
    expect(screen.getByText("a field")).not.toBeNull();
    expect(screen.getByTestId("a-section")).not.toBeNull();
  });

  it("renders without a description when none is given", () => {
    render(
      <FinishSettingsSection heading="Output">
        <p>a field</p>
      </FinishSettingsSection>,
    );
    expect(screen.getByRole("heading", { level: 3, name: "Output" })).not.toBeNull();
  });
});
