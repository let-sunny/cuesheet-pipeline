// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TabList } from "@astryxdesign/core/TabList";
import { NavTab } from "./NavTab.js";

afterEach(cleanup);

describe("NavTab", () => {
  it("renders the label and forwards data-testid, same as a plain Tab", () => {
    render(
      <TabList value="a" onChange={() => {}}>
        <NavTab value="a" label="First" data-testid="nav-tab-a" />
        <NavTab value="b" label="Second" data-testid="nav-tab-b" />
      </TabList>,
    );
    expect(screen.getByTestId("nav-tab-a").textContent).toContain("First");
    expect(screen.getByTestId("nav-tab-b").textContent).toContain("Second");
  });

  it("still calls the TabList's onChange when clicked", () => {
    const onChange = vi.fn();
    render(
      <TabList value="a" onChange={onChange}>
        <NavTab value="a" label="First" />
        <NavTab value="b" label="Second" />
      </TabList>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Second" }));
    expect(onChange).toHaveBeenCalledWith("b");
  });
});
