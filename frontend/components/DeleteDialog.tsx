"use client";

import Dialog from "./Dialog";
import { BTN_GHOST, BTN_PRIMARY } from "./styles";

/** Confirms a delete, or explains why it is refused. */
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
  onConfirm?: () => void;
  onClose: () => void;
}) {
  const blocked = !onConfirm;

  return (
    <Dialog
      title={title}
      onClose={onClose}
      footer={
        <div className="d-flex justify-content-end gap-2 w-100">
          <button type="button" onClick={onClose} className={BTN_GHOST} data-testid="close-dialog">
            {blocked ? "Close" : "Cancel"}
          </button>
          {onConfirm && (
            <button
              type="button"
              onClick={() => {
                onConfirm();
                onClose();
              }}
              className={BTN_PRIMARY}
              data-testid="confirm-delete"
            >
              {confirmLabel}
            </button>
          )}
        </div>
      }
    >
      <p className="mb-0" data-testid="delete-message">
        {body}
      </p>
    </Dialog>
  );
}
