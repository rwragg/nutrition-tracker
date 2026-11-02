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
});
