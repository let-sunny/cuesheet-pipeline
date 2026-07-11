// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ToggleButtonGroup } from "@astryxdesign/core/ToggleButton";
import { FilterChip } from "./FilterChip.js";

afterEach(cleanup);

describe("FilterChip", () => {
  it("renders the label, same as a plain ToggleButton", () => {
    render(
      <ToggleButtonGroup type="single" label="Filter" value="all" onChange={() => {}}>
        <FilterChip value="all" label="All (3)" />
        <FilterChip value="cat" label="Cat (1)" />
      </ToggleButtonGroup>,
    );
    expect(screen.getByRole("button", { name: "All (3)" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Cat (1)" })).not.toBeNull();
  });

  it("still calls the group's onChange when clicked", () => {
    const onChange = vi.fn();
    render(
      <ToggleButtonGroup type="single" label="Filter" value="all" onChange={onChange}>
        <FilterChip value="all" label="All (3)" />
        <FilterChip value="cat" label="Cat (1)" />
      </ToggleButtonGroup>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Cat (1)" }));
    expect(onChange).toHaveBeenCalledWith("cat");
  });
});
