"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiError, deleteProfile, getProfile, saveProfile } from "./api";
import type { ProfileInput, ProfileState, SaveResult } from "./types";

const OFFLINE =
  "Could not reach the server. Check your connection and try again.";

function reason(error: unknown): string {
  return error instanceof ApiError ? error.message : OFFLINE;
}

/**
 * The account's profile and the targets the server worked out from it (Part 12).
 *
 * Held in the app rather than in the dialog because the Day view reads it too, and because the browser
 * keeps a copy and never the truth (D12): every change goes to the server first and the screen shows
 * what came back. A failed read leaves the state null, which is the fixed targets, so the log still
 * works and the person is told why their own targets are not showing.
 */
export function useProfile() {
  const [state, setState] = useState<ProfileState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // True once the server has told us whether there is a profile, by a read, a save or a remove. A failed read
  // leaves `state` null too, but that is "we do not know", not "there is none": the first must not tell a
  // person to set one up, and dismissing an error message must not change which of the two it is.
  const [known, setKnown] = useState(false);

  useEffect(() => {
    let active = true;

    getProfile()
      .then((loaded) => {
        if (active) {
          setState(loaded);
          setKnown(true);
        }
      })
      .catch((cause: unknown) => {
        if (active)
          setError(
            `Your profile could not be loaded, so the standard targets are showing. ${reason(cause)}`,
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  /** Saves and keeps what the server answered. A refusal is returned, so the dialog can say which field. */
  const save = useCallback(async (input: ProfileInput): Promise<SaveResult> => {
    try {
      setState(await saveProfile(input));
      setKnown(true);
      setError(null);
      return { ok: true };
    } catch (cause) {
      return { ok: false, message: reason(cause) };
    }
  }, []);

  const remove = useCallback(async (): Promise<SaveResult> => {
    try {
      await deleteProfile();
      setState(null);
      setKnown(true);
      return { ok: true };
    } catch (cause) {
      return { ok: false, message: reason(cause) };
    }
  }, []);

  const dismissError = useCallback(() => setError(null), []);

  /** The server has said there is no profile (R54: nothing can be added until there is one). */
  const none = known && state === null;

  return { state, none, loading, error, save, remove, dismissError };
}
