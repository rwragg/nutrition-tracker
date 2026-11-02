"use client";

import { useCallback, useEffect, useState } from "react";
import {
  getTelegramLink,
  mintTelegramCode,
  unlinkTelegram,
  ApiError,
  type PairingCode,
} from "@/lib/api";
import Dialog from "./Dialog";
import { BTN_GHOST, BTN_PRIMARY } from "./styles";

/** The server's sentence when it has one; otherwise the same line the rest of the app uses. */
function reason(error: unknown): string {
  return error instanceof ApiError
    ? error.message
    : "Could not reach the server. Check your connection and try again.";
}

/** Whole minutes left, rounded up, so the last minute reads "1 minute" and not "0". */
function minutesLeft(code: PairingCode, now: number): number {
  return Math.ceil((Date.parse(code.expires) - now) / 60_000);
}

/**
 * Link this account to a Telegram chat, or unlink it.
 *
 * The code is shown here and redeemed in the chat (D18): a password is never typed into Telegram, and
 * the person never has to know their chat id, because the bot reads it from the message it receives.
 * Asking for a code is a button rather than something that happens on open, because a new code retires
 * the old one: opening the dialog twice must not quietly break a code someone is mid-way through
 * sending.
 *
 * Nothing here decides whether a code is valid or a chat is free. The server does, and its sentence is
 * shown as it came.
 */
export default function TelegramDialog({
  onClose,
  pollMs = 3000,
}: {
  onClose: () => void;
  /** How often to ask whether the code has been redeemed while one is showing. */
  pollMs?: number;
}) {
  // undefined while the first answer is pending, null when there is no chat, the chat id otherwise.
  const [linked, setLinked] = useState<string | null | undefined>(undefined);
  const [code, setCode] = useState<PairingCode | null>(null);
  const [working, setWorking] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let active = true;

    getTelegramLink()
      .then((chat) => {
        if (active) setLinked(chat);
      })
      .catch((cause: unknown) => {
        if (active) {
          setLinked(null);
          setProblem(reason(cause));
        }
      });

    return () => {
      active = false;
    };
  }, []);

  const showing = code !== null && linked === null;

  // While a code is on screen: tick the countdown, and watch for the chat redeeming it, so the dialog
  // moves to "linked" by itself instead of leaving the person to wonder whether it worked.
  useEffect(() => {
    if (!showing) return;

    const clock = setInterval(() => setNow(Date.now()), 1000);
    const watch = setInterval(() => {
      getTelegramLink()
        .then((chat) => {
          if (chat !== null) {
            setLinked(chat);
            setCode(null);
          }
        })
        .catch(() => undefined); // a missed poll is not worth a message; the next one asks again
    }, pollMs);

    return () => {
      clearInterval(clock);
      clearInterval(watch);
    };
  }, [showing, pollMs]);

  const getCode = useCallback(async () => {
    setWorking(true);
    setProblem(null);
    try {
      setCode(await mintTelegramCode());
      setNow(Date.now());
    } catch (cause) {
      setProblem(reason(cause));
    } finally {
      setWorking(false);
    }
  }, []);

  const unlink = useCallback(async () => {
    setWorking(true);
    setProblem(null);
    try {
      await unlinkTelegram();
      setLinked(null);
      setCode(null);
    } catch (cause) {
      setProblem(reason(cause));
    } finally {
      setWorking(false);
    }
  }, []);

  const minutes = code ? minutesLeft(code, now) : 0;
  const expired = code !== null && minutes <= 0;

  return (
    <Dialog
      title="Telegram"
      onClose={onClose}
      footer={
        <div className="d-flex justify-content-end gap-2 w-100">
          <button type="button" onClick={onClose} className={BTN_GHOST} data-testid="close-dialog">
            Close
          </button>
        </div>
      }
    >
      <div className="d-flex flex-column gap-3" data-testid="telegram-dialog">
        {linked === undefined && !problem && (
          <p className="text-muted-brand mb-0" data-testid="telegram-loading">
            Checking...
          </p>
        )}

        {typeof linked === "string" && (
          <>
            <p className="mb-0" data-testid="telegram-linked">
              This account is linked to Telegram chat <span className="tabular">{linked}</span>. Send{" "}
              <code>/today</code> or <code>/log</code> to the bot to read and add to your log.
            </p>
            <div>
              <button
                type="button"
                className={BTN_GHOST}
                onClick={unlink}
                disabled={working}
                data-testid="telegram-unlink"
              >
                {working ? "Unlinking..." : "Unlink this chat"}
              </button>
            </div>
          </>
        )}

        {linked === null && !code && (
          <>
            <p className="mb-0">
              Link a Telegram chat to read and add to your log from there. You get a code here, and send it
              to the bot.
            </p>
            <div>
              <button
                type="button"
                className={BTN_PRIMARY}
                onClick={getCode}
                disabled={working}
                data-testid="telegram-get-code"
              >
                {working ? "Getting a code..." : "Get a code"}
              </button>
            </div>
          </>
        )}

        {linked === null && code && (
          <>
            <p className="mb-0">Open the bot in Telegram and send this line:</p>
            <p className="pairing-code mb-0" data-testid="telegram-bind-line">
              /bind <strong data-testid="telegram-code">{code.code}</strong>
            </p>
            <p
              className={expired ? "small text-ember mb-0" : "small text-muted-brand mb-0"}
              data-testid="telegram-expiry"
            >
              {expired
                ? "This code has expired."
                : `Works once, for ${minutes} more ${minutes === 1 ? "minute" : "minutes"}.`}
            </p>
            <div>
              <button
                type="button"
                className={expired ? BTN_PRIMARY : BTN_GHOST}
                onClick={getCode}
                disabled={working}
                data-testid="telegram-new-code"
              >
                {working ? "Getting a code..." : "Get a new code"}
              </button>
            </div>
          </>
        )}

        {problem && (
          <p className="small text-ember mb-0" role="alert" data-testid="telegram-problem">
            {problem}
          </p>
        )}
      </div>
    </Dialog>
  );
}
