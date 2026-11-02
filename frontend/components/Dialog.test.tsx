import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import Dialog from "@/components/Dialog";

/**
 * The dialog's own behaviour: what the keyboard does inside it, and when a click outside means
 * "close". The browser suite covers opening and closing one; these cover the parts a person notices
 * only when they are wrong - Tab escaping to the page behind, or a stray click closing the form.
 */
function open(onClose = vi.fn()) {
  render(
    <Dialog title="Add food" onClose={onClose} footer={<button type="button">Save</button>}>
      <input aria-label="Quantity" />
    </Dialog>,
  );

  return onClose;
}

describe("the dialog", () => {
  it("closes on Escape", () => {
    const onClose = open();

    fireEvent.keyDown(document, { key: "Escape" });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("keeps Tab inside it: from the last control round to the first", () => {
    open();
    const first = screen.getByRole("button", { name: "Close" });
    const last = screen.getByRole("button", { name: "Save" });

    last.focus();
    fireEvent.keyDown(document, { key: "Tab" });

    expect(first).toHaveFocus();
  });

  it("keeps Shift+Tab inside it too: from the first control back to the last", () => {
    open();
    const first = screen.getByRole("button", { name: "Close" });
    const last = screen.getByRole("button", { name: "Save" });

    first.focus();
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });

    expect(last).toHaveFocus();
  });

  it("leaves Tab alone in the middle of the form", () => {
    open();
    const middle = screen.getByLabelText("Quantity");
    const last = screen.getByRole("button", { name: "Save" });

    middle.focus();
    fireEvent.keyDown(document, { key: "Tab" });

    // Not prevented, and not moved: the browser's own tab order takes it from here.
    expect(last).not.toHaveFocus();
    expect(middle).toHaveFocus();
  });

  it("closes when the backdrop is clicked, and stays open when the panel is", () => {
    const onClose = open();
    const panel = screen.getByRole("dialog");

    fireEvent.mouseDown(panel);
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.mouseDown(panel.parentElement!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("puts the focus inside when it opens, and back where it was when it closes", () => {
    const opener = document.createElement("button");
    document.body.append(opener);
    opener.focus();

    const { unmount } = render(
      <Dialog title="Add food" onClose={vi.fn()} footer={<button type="button">Save</button>}>
        <input aria-label="Quantity" />
      </Dialog>,
    );

    expect(screen.getByRole("button", { name: "Close" })).toHaveFocus();

    unmount();

    expect(document.activeElement).toBe(opener);
    opener.remove();
  });

  it("does not pull focus back to the first field when its parent re-renders", () => {
    // Callers pass an inline onClose, so every parent render hands the dialog a new function. That used
    // to re-run the effect that focuses the first control, in the middle of someone typing.
    function Host({ tick }: { tick: number }) {
      return (
        <Dialog title="Add food" onClose={() => undefined} footer={<span>{tick}</span>}>
          <input aria-label="Quantity" />
          <input aria-label="Name" />
        </Dialog>
      );
    }

    const { rerender } = render(<Host tick={0} />);
    const name = screen.getByLabelText("Name");
    name.focus();

    rerender(<Host tick={1} />);
    rerender(<Host tick={2} />);

    expect(name).toHaveFocus();
  });

  it("calls the latest onClose, not the one it opened with", () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = render(
      <Dialog title="Add food" onClose={first} footer={null}>
        <input aria-label="Quantity" />
      </Dialog>,
    );
    rerender(
      <Dialog title="Add food" onClose={second} footer={null}>
        <input aria-label="Quantity" />
      </Dialog>,
    );

    fireEvent.keyDown(document, { key: "Escape" });

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("does not throw on Tab when there is nothing to focus", () => {
    render(
      <Dialog title="Empty" onClose={vi.fn()} footer={null}>
        <p>Nothing here</p>
      </Dialog>,
    );
    screen.getByRole("button", { name: "Close" }).blur();
    // The close button is always there, so remove it to model a panel with no controls at all.
    screen.getByRole("button", { name: "Close" }).remove();

    expect(() => fireEvent.keyDown(document, { key: "Tab" })).not.toThrow();
  });
});
