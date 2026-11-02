"use client";

import { useState } from "react";
import Dialog from "./Dialog";
import { BTN_GHOST, BTN_PRIMARY } from "./styles";

/**
 * Confirms a delete, or shows why the server refused it.
 *
 * The refusal is not predicted here: the confirm button asks the server and reports what came
 * back. The rule lives in the backend - a foreign key, and a check that runs first so it can name
 * what is in the way - and duplicating it here would give the client a second opinion to be wrong.
 */
export default function DeleteDialog({
  title,
  body,
  confirmLabel,
  onConfirm,
  onClose,
}: {
  title: string;
  body: string;
  confirmLabel: string;
  /** Resolves to null when it was deleted, or to the reason it was not. */
  onConfirm: () => Promise<string | null>;
  onClose: () => void;
}) {
  const [problem, setProblem] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  async function confirm() {
    setWorking(true);
    const refusal = await onConfirm();
    setWorking(false);

    if (refusal) {
      setProblem(refusal);
      return;
    }

    onClose();
  }

  return (
    <Dialog
      title={problem ? "That could not be deleted" : title}
      onClose={onClose}
      footer={
        <div className="d-flex justify-content-end gap-2 w-100">
          <button
            type="button"
            onClick={onClose}
            className={BTN_GHOST}
            data-testid={problem ? "close-after-problem" : "close-dialog"}
          >
            {problem ? "Close" : "Cancel"}
          </button>
          {!problem && (
            <button
              type="button"
              onClick={confirm}
              disabled={working}
              className={BTN_PRIMARY}
              data-testid="confirm-delete"
            >
              {working ? "Deleting..." : confirmLabel}
            </button>
          )}
        </div>
      }
    >
      <p className="mb-0" data-testid={problem ? "delete-problem" : "delete-message"}>
        {problem ?? body}
      </p>
    </Dialog>
  );
}
