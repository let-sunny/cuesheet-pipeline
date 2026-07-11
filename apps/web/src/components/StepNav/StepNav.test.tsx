// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StepNav } from "./StepNav.js";

afterEach(cleanup);

describe("StepNav", () => {
  it("marks the current step as selected (aria-current) and the others as not", () => {
    render(
      <StepNav step="edit" onChange={() => {}} sceneInUse={2} sceneTotal={4} subtitleFilled={2} subtitleTotal={5} />,
    );
    expect(screen.getByRole("button", { name: /Scenes/ }).getAttribute("aria-current")).toBeNull();
    expect(screen.getByRole("button", { name: /Edit/ }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("button", { name: /Export/ }).getAttribute("aria-current")).toBeNull();
  });

  it("calls onChange with the clicked step's value", () => {
    const onChange = vi.fn();
    render(
      <StepNav step="compose" onChange={onChange} sceneInUse={0} sceneTotal={0} subtitleFilled={0} subtitleTotal={0} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Export/ }));
    expect(onChange).toHaveBeenCalledWith("finish");
  });

  it("shows the segment count badge on the Scenes tab", () => {
    render(
      <StepNav step="compose" onChange={() => {}} sceneInUse={7} sceneTotal={12} subtitleFilled={0} subtitleTotal={0} />,
    );
    expect(screen.getByText("7/12")).not.toBeNull();
  });

  it("shows the filled/total subtitle badge on the Edit tab", () => {
    render(
      <StepNav step="compose" onChange={() => {}} sceneInUse={0} sceneTotal={0} subtitleFilled={4} subtitleTotal={9} />,
    );
    expect(screen.getByText("4/9 subtitled")).not.toBeNull();
  });
});
