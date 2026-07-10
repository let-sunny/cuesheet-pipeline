// @vitest-environment jsdom
import { useState } from "react";
import { render, cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useEditableTitle } from "../../src/hooks/useEditableTitle.js";

afterEach(cleanup);

function Harness({ onCommit, initial = "My Project" }: { onCommit: (n: string) => void; initial?: string }) {
  const [value, setValue] = useState(initial);
  const field = useEditableTitle({
    value,
    onCommit: (next) => {
      setValue(next);
      onCommit(next);
    },
  });
  return field.editing ? (
    <input aria-label="title" value={field.text} onChange={field.onChange} onBlur={field.onBlur} onKeyDown={field.onKeyDown} />
  ) : (
    <button type="button" onClick={field.startEditing}>
      {value}
    </button>
  );
}

describe("useEditableTitle", () => {
  it("starts not editing, seeded with the current value once editing begins", () => {
    render(<Harness onCommit={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "My Project" }));
    expect((screen.getByLabelText("title") as HTMLInputElement).value).toBe("My Project");
  });

  it("commits the trimmed value on blur", () => {
    const onCommit = vi.fn();
    render(<Harness onCommit={onCommit} />);
    fireEvent.click(screen.getByRole("button", { name: "My Project" }));
    fireEvent.change(screen.getByLabelText("title"), { target: { value: "  New Name  " } });
    fireEvent.blur(screen.getByLabelText("title"));
    expect(onCommit).toHaveBeenCalledOnce();
    expect(onCommit).toHaveBeenCalledWith("New Name");
    expect(screen.getByRole("button", { name: "New Name" })).not.toBeNull();
  });

  it("Enter blurs the input, which commits", () => {
    const onCommit = vi.fn();
    render(<Harness onCommit={onCommit} />);
    fireEvent.click(screen.getByRole("button", { name: "My Project" }));
    const input = screen.getByLabelText("title") as HTMLInputElement;
    // The hook's Enter handler calls e.currentTarget.blur() - jsdom only fires a real blur event
    // if the element is actually the focused element, so focus it first (as a real user would).
    input.focus();
    fireEvent.change(input, { target: { value: "Renamed" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onCommit).toHaveBeenCalledWith("Renamed");
  });

  it("Escape cancels without committing, reverting to the previous value", () => {
    const onCommit = vi.fn();
    render(<Harness onCommit={onCommit} />);
    fireEvent.click(screen.getByRole("button", { name: "My Project" }));
    fireEvent.change(screen.getByLabelText("title"), { target: { value: "Discarded" } });
    fireEvent.keyDown(screen.getByLabelText("title"), { key: "Escape" });
    expect(onCommit).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "My Project" })).not.toBeNull();
  });

  it("rejects an empty/whitespace-only commit, reverting without calling onCommit", () => {
    const onCommit = vi.fn();
    render(<Harness onCommit={onCommit} />);
    fireEvent.click(screen.getByRole("button", { name: "My Project" }));
    fireEvent.change(screen.getByLabelText("title"), { target: { value: "   " } });
    fireEvent.blur(screen.getByLabelText("title"));
    expect(onCommit).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "My Project" })).not.toBeNull();
  });

  it("does not call onCommit when the value is unchanged", () => {
    const onCommit = vi.fn();
    render(<Harness onCommit={onCommit} />);
    fireEvent.click(screen.getByRole("button", { name: "My Project" }));
    fireEvent.blur(screen.getByLabelText("title"));
    expect(onCommit).not.toHaveBeenCalled();
  });
});
