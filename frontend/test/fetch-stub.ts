import { vi } from "vitest";
import type {
  Day,
  Food,
  FoodCandidate,
  LogEntry,
  Meal,
  Section,
} from "@/lib/types";
import {
  DATES,
  EMPTY_SECTIONS,
  FOODS,
  MEALS,
  SECTIONS_BY_DATE,
  macrosOf,
} from "./fixture";

type SessionAnswer = { ok: boolean; body?: unknown; status?: number };
type LoginAnswer = { ok: boolean; body?: unknown; status?: number };

/** What an intercepting handler returns: an answer, or nothing to let the stub handle it. */
type Intercepted = { ok: boolean; body?: unknown; status?: number } | undefined;

type World = {
  foods: Food[];
  meals: Meal[];
  entries: Record<string, Day["sections"]>;
  created: number;
};

const SECTIONS: Section[] = ["breakfast", "lunch", "dinner", "snacks"];

function cloneSections(sections: Day["sections"]): Day["sections"] {
  return {
    breakfast: sections.breakfast.map((entry) => ({ ...entry })),
    lunch: sections.lunch.map((entry) => ({ ...entry })),
    dinner: sections.dinner.map((entry) => ({ ...entry })),
    snacks: sections.snacks.map((entry) => ({ ...entry })),
  };
}

function world(): World {
  return {
    foods: FOODS.map((food) => ({ ...food, macros: { ...food.macros } })),
    meals: MEALS.map((meal) => ({
      ...meal,
      ingredients: meal.ingredients.map((item) => ({ ...item })),
    })),
    entries: Object.fromEntries(
      DATES.map((date) => [
        date,
        cloneSections(SECTIONS_BY_DATE[date] ?? EMPTY_SECTIONS),
      ]),
    ),
    created: 0,
  };
}

/**
 * A stand-in for the backend, over a copy of `test/fixture.ts`.
 *
 * The app is API-backed now, so a component test needs a server to talk to rather than a store to
 * hand it. This answers the same routes with the same shapes, and refuses a delete the same way -
 * by looking at what still references the record - so the refusal a test sees comes from the same
 * rule the real backend applies, instead of the test predicting it.
 *
 * The app also asks who is signed in before it renders anything, so a fetch that answers is needed
 * either way. Signed in by default, because that is the state most tests are about; a test that
 * needs the signed-out screen or a failed sign-in overrides the handler it cares about.
 */
/** Nobody real (R51): the account every stubbed test is signed in as, unless it asks for none. */
export const STUB_PERSON: Record<string, unknown> = {
  display_name: "Ana Example",
  sex: "male",
  birth_date: "1986-03-01",
  height_cm: 178,
  weight_kg: 82,
  weight_on: "2026-10-12",
  activity: "moderate",
  goal: "lose",
  units: "metric",
  kcal_override: null,
  protein_override: null,
};

export function stubFetch(
  handlers: {
    session?: SessionAnswer;
    login?: (submitted: {
      username?: string;
      password?: string;
    }) => LoginAnswer;
    /** Answer a registration. Refuse one with {ok:false, status:409, body:{detail:"..."}}. */
    register?: (submitted: {
      username?: string;
      email?: string;
    }) => LoginAnswer;
    /**
     * The Telegram link. `linked` is the chat the account starts linked to. A code is minted as `code`
     * and expires `expiresInMs` from now, which may be negative for a code that has already run out.
     * The returned `chat` object is live: set `chat.id` to simulate the chat redeeming the code.
     */
    telegram?: { linked?: string | null; code?: string; expiresInMs?: number };
    /**
     * What a food lookup finds. `results` answers every query; `refuse` answers with that status and
     * sentence instead. `asked` collects the queries, so a test can see what the app sent.
     */
    lookup?: {
      results?: FoodCandidate[];
      refuse?: { status: number; detail: string };
      asked?: string[];
    };
    /**
     * The profile. `existing` is what the account starts with: **an invented person by default**, because an
     * account with no profile cannot add anything (R54) and most tests add something; a test about having none
     * says `existing: null`. Saving stores what was
     * sent and answers with canned targets - 2,150 kcal and 130 g, or the person's own figures where they
     * set them - because the arithmetic is the backend's and is tested there; a second copy here would be
     * one more thing to drift. `sent` collects every body saved, so a test can see exactly what went out.
     * `today` dates a changed weight, as the server does. `refuse` answers a save with a 422 naming a field.
     */
    profile?: {
      existing?: Record<string, unknown> | null;
      sent?: Record<string, unknown>[];
      today?: string;
      floored?: boolean;
      refuse?: { field: string; msg: string };
    };
    /** Answer a request yourself - to fail one, or to answer a route the stub does not know. */
    intercept?: (request: {
      path: string;
      method: string;
      body: unknown;
    }) => Intercepted;
    /** Requests that reject, the way they do when the server cannot be reached. All of them, or those a predicate picks out. */
    offline?:
      boolean | ((request: { path: string; method: string }) => boolean);
  } = {},
) {
  const data = world();
  const chat = {
    id: handlers.telegram?.linked ?? (null as string | null),
    minted: 0,
  };
  let profile: Record<string, unknown> | null =
    handlers.profile && "existing" in handlers.profile
      ? (handlers.profile.existing ?? null)
      : { ...STUB_PERSON };

  /** The shape the backend answers with: the profile, and targets worked out from it. Canned, see above. */
  const profileAnswer = () => {
    if (!profile) return { profile: null, targets: null };

    const kcalOwn = profile.kcal_override as number | null;
    const proteinOwn = profile.protein_override as number | null;
    const floored = handlers.profile?.floored ?? false;
    const computed = { calories: floored ? 1200 : 2150, protein: 130 };

    return {
      profile,
      targets: {
        calories: kcalOwn ?? computed.calories,
        protein: proteinOwn ?? computed.protein,
        calories_from:
          kcalOwn !== null && kcalOwn !== undefined ? "own" : "profile",
        protein_from:
          proteinOwn !== null && proteinOwn !== undefined ? "own" : "profile",
        computed,
        working: {
          age: 40,
          resting: 1737.5,
          activity_factor: 1.55,
          daily_need: 2693.1,
          goal_factor: 0.8,
          after_goal: 2154.5,
          floor: 1500,
          floored,
          protein_per_kg: 1.6,
          protein_before_rounding: 131.2,
        },
      },
    };
  };

  vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), "http://localhost");
    const path = url.pathname;
    const method = (init?.method ?? "GET").toUpperCase();
    const body = init?.body ? JSON.parse(String(init.body)) : null;

    const answer = (payload: unknown, status = 200) =>
      Promise.resolve(
        new Response(status === 204 ? null : JSON.stringify(payload ?? {}), {
          status,
        }),
      );

    const unreachable =
      handlers.offline === true ||
      (typeof handlers.offline === "function" &&
        handlers.offline({ path, method }));
    if (unreachable) {
      return Promise.reject(new TypeError("Failed to fetch"));
    }

    const intercepted = handlers.intercept?.({ path, method, body });
    if (intercepted)
      return answer(
        intercepted.body,
        intercepted.status ?? (intercepted.ok ? 200 : 500),
      );

    // --- the session ------------------------------------------------------------------
    if (path === "/api/session") {
      const session = handlers.session ?? {
        ok: true,
        body: { username: "user" },
      };
      return answer(session.body, session.status ?? (session.ok ? 200 : 401));
    }

    if (path === "/api/register") {
      // Like the real server (Part 14, R65): a new account is pending, and says so.
      const registered = handlers.register?.(body ?? {}) ?? {
        ok: true,
        body: { id: `user-${++data.created}`, username: body?.username, status: "pending" },
      };
      return answer(
        registered.body ?? {
          id: `user-${++data.created}`,
          username: body?.username,
          status: "pending",
        },
        registered.status ?? (registered.ok ? 201 : 409),
      );
    }

    if (path === "/api/login") {
      const login = handlers.login?.(body ?? {}) ?? {
        ok: true,
        body: { username: body?.username },
      };
      return answer(
        login.body ?? { username: body?.username },
        login.status ?? (login.ok ? 200 : 401),
      );
    }

    if (path === "/api/logout") return answer({ status: "signed out" });

    // --- looking a food up -------------------------------------------------------------
    if (path === "/api/lookup/foods" && method === "GET") {
      handlers.lookup?.asked?.push(url.searchParams.get("q") ?? "");
      const refuse = handlers.lookup?.refuse;
      if (refuse) return answer({ detail: refuse.detail }, refuse.status);
      return answer({
        query: url.searchParams.get("q"),
        results: handlers.lookup?.results ?? [],
      });
    }

    // --- the profile (Part 12) -----------------------------------------------------------
    if (path === "/api/profile" && method === "GET")
      return answer(profileAnswer());

    if (path === "/api/profile" && method === "PUT") {
      const refuse = handlers.profile?.refuse;
      if (refuse) {
        return answer(
          {
            detail: [
              {
                type: "value_error",
                loc: ["body", refuse.field],
                msg: refuse.msg,
              },
            ],
          },
          422,
        );
      }

      handlers.profile?.sent?.push(body);

      // The server dates a weight by whether it moved by 0.05 kg or more.
      const today = handlers.profile?.today ?? "2026-11-04";
      const kept =
        profile &&
        Math.abs((profile.weight_kg as number) - body.weight_kg) < 0.05
          ? (profile.weight_on as string)
          : today;
      profile = { ...body, weight_on: kept };
      return answer(profileAnswer());
    }

    if (path === "/api/profile" && method === "DELETE") {
      profile = null;
      return answer(null, 204);
    }

    // --- the Telegram link ------------------------------------------------------------
    if (path === "/api/telegram/link" && method === "GET")
      return answer({ telegram_id: chat.id });

    if (path === "/api/telegram/link" && method === "DELETE") {
      chat.id = null;
      return answer(null, 204);
    }

    if (path === "/api/telegram/code" && method === "POST") {
      chat.minted += 1;
      const lasts = handlers.telegram?.expiresInMs ?? 15 * 60_000;
      // The server's shape: whole seconds, UTC, a trailing Z.
      const expires = new Date(Date.now() + lasts)
        .toISOString()
        .replace(/\.\d{3}Z$/, "Z");
      return answer(
        { code: handlers.telegram?.code ?? `CODE${chat.minted}X`, expires },
        201,
      );
    }

    // --- foods ------------------------------------------------------------------------
    if (path === "/api/foods" && method === "GET") return answer(data.foods);

    if (path === "/api/foods" && method === "POST") {
      data.created += 1;
      const created: Food = {
        id: `food-${data.created}`,
        name: body.name,
        unit: body.unit,
        macros: {
          calories: body.calories,
          protein: body.protein,
          carbs: body.carbs,
          fat: body.fat,
        },
        source: body.source ?? "typed",
        sourceId: body.source_id,
      };
      data.foods.push(created);
      return answer(created, 201);
    }

    const foodMatch = path.match(/^\/api\/foods\/([^/]+)$/);
    if (foodMatch) {
      const id = decodeURIComponent(foodMatch[1]);
      const index = data.foods.findIndex((food) => food.id === id);
      if (index < 0) return answer({ detail: "no such food" }, 404);

      if (method === "PUT") {
        data.foods[index] = {
          id,
          name: body.name,
          unit: body.unit,
          macros: {
            calories: body.calories,
            protein: body.protein,
            carbs: body.carbs,
            fat: body.fat,
          },
        };
        return answer(data.foods[index]);
      }

      if (method === "DELETE") {
        const meals = data.meals.filter((meal) =>
          meal.ingredients.some((ingredient) => ingredient.foodId === id),
        );
        const days = Object.keys(data.entries).filter((date) =>
          SECTIONS.some((section) =>
            data.entries[date][section].some(
              (entry) => entry.kind === "food" && entry.foodId === id,
            ),
          ),
        );

        if (meals.length > 0 || days.length > 0) {
          return answer(
            {
              detail: {
                message: "cannot be deleted",
                usedBy: {
                  meals: meals.map((meal) => ({
                    id: meal.id,
                    name: meal.name,
                  })),
                  days,
                },
              },
            },
            409,
          );
        }

        data.foods.splice(index, 1);
        return answer(null, 204);
      }
    }

    // --- meals ------------------------------------------------------------------------
    const ingredientsFrom = (sent: { food_id: string; quantity: number }[]) =>
      (sent ?? []).map((item) => ({
        foodId: item.food_id,
        quantity: item.quantity,
      }));

    if (path === "/api/meals" && method === "GET") return answer(data.meals);

    if (path === "/api/meals" && method === "POST") {
      data.created += 1;
      const created: Meal = {
        id: `meal-${data.created}`,
        name: body.name,
        ingredients: ingredientsFrom(body.ingredients),
      };
      data.meals.push(created);
      return answer(created, 201);
    }

    const mealMatch = path.match(/^\/api\/meals\/([^/]+)$/);
    if (mealMatch) {
      const id = decodeURIComponent(mealMatch[1]);
      const index = data.meals.findIndex((meal) => meal.id === id);
      if (index < 0) return answer({ detail: "no such meal" }, 404);

      if (method === "PUT") {
        data.meals[index] = {
          id,
          name: body.name,
          ingredients: ingredientsFrom(body.ingredients),
        };
        return answer(data.meals[index]);
      }

      if (method === "DELETE") {
        const days = Object.keys(data.entries).filter((date) =>
          SECTIONS.some((section) =>
            data.entries[date][section].some(
              (entry) => entry.kind === "meal" && entry.mealId === id,
            ),
          ),
        );

        if (days.length > 0) {
          return answer(
            {
              detail: {
                message: "cannot be deleted",
                usedBy: { meals: [], days },
              },
            },
            409,
          );
        }

        data.meals.splice(index, 1);
        return answer(null, 204);
      }
    }

    // --- days and entries -------------------------------------------------------------
    if (path === "/api/days" && method === "GET") {
      return answer(
        Object.keys(data.entries).map((date) => ({
          date,
          macros: macrosOf(data.entries[date] ?? EMPTY_SECTIONS),
        })),
      );
    }

    const addEntryMatch = path.match(/^\/api\/days\/([^/]+)\/entries$/);
    if (addEntryMatch && method === "POST") {
      const date = decodeURIComponent(addEntryMatch[1]);
      data.created += 1;
      const entry: LogEntry =
        body.food_id !== undefined
          ? {
              id: `entry-${data.created}`,
              kind: "food",
              foodId: body.food_id,
              quantity: body.quantity,
            }
          : { id: `entry-${data.created}`, kind: "meal", mealId: body.meal_id };

      data.entries[date] = data.entries[date] ?? cloneSections(EMPTY_SECTIONS);
      data.entries[date][body.section as Section].push(entry);

      return answer(entry, 201);
    }

    const removeEntryMatch = path.match(
      /^\/api\/days\/([^/]+)\/entries\/([^/]+)$/,
    );
    if (removeEntryMatch && method === "DELETE") {
      const date = decodeURIComponent(removeEntryMatch[1]);
      const id = decodeURIComponent(removeEntryMatch[2]);
      const sections = data.entries[date];

      if (sections) {
        for (const section of SECTIONS) {
          sections[section] = sections[section].filter(
            (entry) => entry.id !== id,
          );
        }
      }

      return answer(null, 204);
    }

    const dayMatch = path.match(/^\/api\/days\/([^/]+)$/);
    if (dayMatch && method === "GET") {
      const date = decodeURIComponent(dayMatch[1]);
      const sections = data.entries[date] ?? cloneSections(EMPTY_SECTIONS);
      return answer({ date, sections, macros: macrosOf(sections) });
    }

    return answer({ detail: "not found" }, 404);
  });

  return { chat };
}
