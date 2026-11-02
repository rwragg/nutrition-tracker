"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import * as api from "./api";
import { ApiError } from "./api";
import { toIsoDate } from "./dates";
import type {
  Day,
  EntryDraft,
  FoodInput,
  MealInput,
  SaveResult,
  Section,
  Store,
} from "./types";

/**
 * The app's copy of what the server holds.
 *
 * Nothing here is a source of truth: the database is. This hook reads the records, hands writes to
 * the API, and re-reads after every write, so what is on screen is what was last reported rather
 * than a local edit that may or may not have landed. The open day is the only thing held that the
 * server does not hand back in one piece, and it is re-read whenever anything could have changed it.
 */
export interface Tracker {
  store: Store | null;
  day: Day | null;
  loading: boolean;
  error: string | null;
  dismissError: () => void;
  selectDay: (date: string) => Promise<void>;
  saveFood: (existingId: string | null, input: FoodInput) => Promise<SaveResult>;
  deleteFood: (id: string) => Promise<SaveResult>;
  saveMeal: (existingId: string | null, input: MealInput) => Promise<SaveResult>;
  deleteMeal: (id: string) => Promise<SaveResult>;
  addEntry: (section: Section, draft: EntryDraft) => Promise<SaveResult>;
  removeEntry: (section: Section, entryId: string) => Promise<SaveResult>;
}

type Loaded = { store: Store; day: Day };

const UNREACHABLE = "Could not reach the server. Check your connection and try again.";

function failure(error: unknown): SaveResult {
  if (error instanceof ApiError) {
    return { ok: false, message: error.message, refusal: error.refusal };
  }
  return { ok: false, message: UNREACHABLE };
}

function messageOf(error: unknown): string {
  return error instanceof ApiError ? error.message : UNREACHABLE;
}

/** An empty day, for a date that has nothing on it. */
function emptyDay(date: string): Day {
  return {
    id: date,
    date,
    macros: { calories: 0, protein: 0, carbs: 0, fat: 0 },
    sections: { breakfast: [], lunch: [], dinner: [], snacks: [] },
  };
}

export function useTracker(): Tracker {
  const [store, setStore] = useState<Store | null>(null);
  const [day, setDay] = useState<Day | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const openDate = useRef<string | null>(null);

  /**
   * Read everything the app shows. Returns the records rather than setting them, so the caller
   * decides when state changes: an effect may not set state while it runs.
   */
  const load = useCallback(async (date?: string): Promise<Loaded> => {
    const [foods, meals, days] = await Promise.all([api.listFoods(), api.listMeals(), api.listDays()]);

    const wanted = date ?? openDate.current ?? toIsoDate(new Date());
    const open = days.some((candidate) => candidate.date === wanted)
      ? await api.getDay(wanted)
      : emptyDay(wanted);

    openDate.current = open.date;
    return { store: { foods, meals, days }, day: open };
  }, []);

  const apply = useCallback((loaded: Loaded) => {
    setStore(loaded.store);
    setDay(loaded.day);
  }, []);

  useEffect(() => {
    let active = true;

    load()
      .then((loaded) => {
        if (active) apply(loaded);
      })
      .catch((cause: unknown) => {
        if (active) setError(messageOf(cause));
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [load, apply]);

  /** Run a write, then re-read. A refusal is returned rather than thrown: it is an answer. */
  const write = useCallback(
    async (action: () => Promise<unknown>): Promise<SaveResult> => {
      try {
        await action();
      } catch (cause) {
        return failure(cause);
      }

      try {
        apply(await load());
      } catch (cause) {
        setError(messageOf(cause));
      }

      return { ok: true };
    },
    [load, apply],
  );

  const selectDay = useCallback(
    async (date: string): Promise<void> => {
      openDate.current = date;
      setDay(emptyDay(date));

      try {
        const loaded = await api.getDay(date);
        // Another day may have been picked while this one was in flight. The newer pick wins: a slow
        // answer for a day nobody is looking at any more must not overwrite the one they are.
        if (openDate.current === date) setDay(loaded);
      } catch (cause) {
        if (openDate.current === date) setError(messageOf(cause));
      }
    },
    [],
  );

  const currentDate = day?.date;

  return {
    store,
    day,
    loading,
    error,
    dismissError: () => setError(null),
    selectDay,
    saveFood: (existingId, input) =>
      write(() => (existingId ? api.updateFood(existingId, input) : api.createFood(input))),
    deleteFood: (id) => write(() => api.deleteFood(id)),
    saveMeal: (existingId, input) =>
      write(() => (existingId ? api.updateMeal(existingId, input) : api.createMeal(input))),
    deleteMeal: (id) => write(() => api.deleteMeal(id)),
    addEntry: (section: Section, draft: EntryDraft) =>
      write(() => api.addEntry(currentDate ?? toIsoDate(new Date()), section, draft)),
    removeEntry: (_section: Section, entryId: string) =>
      write(() => api.removeEntry(currentDate ?? toIsoDate(new Date()), entryId)),
  };
}
