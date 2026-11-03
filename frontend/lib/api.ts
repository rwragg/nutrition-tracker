import type {
  Day,
  FoodCandidate,
  DaySummary,
  EntryDraft,
  Food,
  FoodInput,
  LogEntry,
  Meal,
  MealInput,
  Refusal,
  Section,
} from "./types";

/**
 * The client for the backend API. Every call here is the only way the app reaches the server, so
 * the failure it can raise is described once: `ApiError` carries the status and, when the server
 * refused a delete, the structured reason behind it.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly refusal?: Refusal;

  constructor(status: number, message: string, refusal?: Refusal) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.refusal = refusal;
  }
}

/** The server's detail is sometimes a sentence, sometimes `{message, usedBy}`. */
function readDetail(body: unknown): { message: string; refusal?: Refusal } {
  const detail = (body as { detail?: unknown } | null)?.detail;

  if (typeof detail === "string") return { message: detail };

  if (detail && typeof detail === "object") {
    const { message, usedBy } = detail as { message?: string; usedBy?: Refusal["usedBy"] };
    if (message && usedBy) return { message, refusal: { message, usedBy } };
    if (message) return { message };
  }

  return { message: "The server refused that request." };
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
  });

  if (!response.ok) {
    let body: unknown = null;
    try {
      body = await response.json();
    } catch {
      body = null;
    }

    const { message, refusal } = readDetail(body);
    throw new ApiError(response.status, message, refusal);
  }

  if (response.status === 204) return undefined as T;

  return (await response.json()) as T;
}

type Wire = {
  macros: Record<string, number>;
};

/** The server nests macros; the app's types name the four fields, so they are read out here. */
function macrosOf(wire: { macros: Record<string, number> }) {
  return {
    calories: Number(wire.macros.calories ?? 0),
    protein: Number(wire.macros.protein ?? 0),
    carbs: Number(wire.macros.carbs ?? 0),
    fat: Number(wire.macros.fat ?? 0),
  };
}

function toFood(
  wire: Wire & {
    id: string;
    name: string;
    unit: Food["unit"];
    source?: Food["source"];
    sourceId?: string | null;
  },
): Food {
  return {
    id: wire.id,
    name: wire.name,
    unit: wire.unit,
    macros: macrosOf(wire),
    source: wire.source,
    sourceId: wire.sourceId,
  };
}

/** What the server takes for a food: the macros flattened, and the source named the way it names it. */
function foodBody(input: FoodInput): string {
  return JSON.stringify({
    name: input.name,
    unit: input.unit,
    ...input.macros,
    source: input.source ?? "typed",
    source_id: input.source === "usda" ? input.sourceId : undefined,
  });
}

function toMeal(wire: { id: string; name: string; ingredients: Meal["ingredients"] }): Meal {
  return { id: wire.id, name: wire.name, ingredients: wire.ingredients };
}

function toDay(wire: {
  date: string;
  sections: Record<Section, LogEntry[]>;
  macros: Record<string, number>;
}): Day {
  return {
    id: wire.date,
    date: wire.date,
    macros: macrosOf({ macros: wire.macros }),
    sections: wire.sections,
  };
}

// --- the session (R1) ---------------------------------------------------------------------

/** Who is signed in, or null. A 401 is an answer here, not a failure. */
export async function getSession(): Promise<{
  username: string;
  email: string | null;
  telegram_id: string | null;
} | null> {
  try {
    return await request<{ username: string; email: string | null; telegram_id: string | null }>(
      "/api/session",
    );
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return null;
    throw error;
  }
}

export async function signIn(username: string, password: string): Promise<void> {
  await request<{ username: string }>("/api/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
}

export async function signOut(): Promise<void> {
  await request<{ status: string }>("/api/logout", { method: "POST" });
}

/** Create an account (R24). Does not sign in - the caller does that next, with what was typed. */
export async function registerAccount(input: {
  username: string;
  email: string;
  password: string;
}): Promise<{ id: string; username: string }> {
  return await request<{ id: string; username: string }>("/api/register", {
    method: "POST",
    body: JSON.stringify({
      username: input.username,
      email: input.email,
      password: input.password,
    }),
  });
}

// --- foods that are not in the list (D20) ----------------------------------------------------

/** What USDA offers for a name. Nothing is written: picking one is the caller's separate step. */
export async function lookupFoods(query: string): Promise<FoodCandidate[]> {
  const found = await request<{ results: FoodCandidate[] }>(
    `/api/lookup/foods?q=${encodeURIComponent(query)}`,
  );
  return found.results;
}

// --- linking a Telegram chat (R26, D18) ----------------------------------------------------

/** A pairing code, and when it stops working (an ISO 8601 UTC time). */
export type PairingCode = { code: string; expires: string };

/** The chat this account is linked to, or null. */
export async function getTelegramLink(): Promise<string | null> {
  const link = await request<{ telegram_id: string | null }>("/api/telegram/link");
  return link.telegram_id;
}

/** A fresh code. Asking for one retires any code the account already had. */
export async function mintTelegramCode(): Promise<PairingCode> {
  return await request<PairingCode>("/api/telegram/code", { method: "POST" });
}

export async function unlinkTelegram(): Promise<void> {
  await request<void>("/api/telegram/link", { method: "DELETE" });
}

// --- foods and meals (R5, R7, R8) ---------------------------------------------------------

export async function listFoods(): Promise<Food[]> {
  const foods = await request<
    (Wire & {
      id: string;
      name: string;
      unit: Food["unit"];
      source?: Food["source"];
      sourceId?: string | null;
    })[]
  >("/api/foods");
  return foods.map(toFood);
}

export async function createFood(input: FoodInput): Promise<Food> {
  return toFood(
    await request("/api/foods", { method: "POST", body: foodBody(input) }),
  );
}

export async function updateFood(id: string, input: FoodInput): Promise<Food> {
  return toFood(
    await request(`/api/foods/${encodeURIComponent(id)}`, { method: "PUT", body: foodBody(input) }),
  );
}

export async function deleteFood(id: string): Promise<void> {
  await request<void>(`/api/foods/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export async function listMeals(): Promise<Meal[]> {
  return (await request<{ id: string; name: string; ingredients: Meal["ingredients"] }[]>("/api/meals")).map(toMeal);
}

function mealBody(input: MealInput) {
  return JSON.stringify({
    name: input.name,
    ingredients: input.ingredients.map((item) => ({ food_id: item.foodId, quantity: item.quantity })),
  });
}

export async function createMeal(input: MealInput): Promise<Meal> {
  return toMeal(await request("/api/meals", { method: "POST", body: mealBody(input) }));
}

export async function updateMeal(id: string, input: MealInput): Promise<Meal> {
  return toMeal(
    await request(`/api/meals/${encodeURIComponent(id)}`, { method: "PUT", body: mealBody(input) }),
  );
}

export async function deleteMeal(id: string): Promise<void> {
  await request<void>(`/api/meals/${encodeURIComponent(id)}`, { method: "DELETE" });
}

// --- days and entries (R4, R6, R9, R10) ---------------------------------------------------

export async function listDays(): Promise<DaySummary[]> {
  const days = await request<{ date: string; macros: Record<string, number> }[]>("/api/days");
  return days.map((day) => ({ date: day.date, macros: macrosOf(day) }));
}

/** A date's log. A date with nothing on it is an empty day, not a 404. */
export async function getDay(date: string): Promise<Day> {
  return toDay(await request(`/api/days/${date}`));
}

export async function addEntry(date: string, section: Section, draft: EntryDraft): Promise<LogEntry> {
  const body =
    draft.kind === "food"
      ? { section, food_id: draft.foodId, quantity: draft.quantity }
      : { section, meal_id: draft.mealId };

  const entry = await request<{
    id: string;
    kind: "food" | "meal";
    foodId?: string;
    mealId?: string;
    quantity?: number;
  }>(`/api/days/${date}/entries`, { method: "POST", body: JSON.stringify(body) });

  return entry.kind === "food"
    ? { id: entry.id, kind: "food", foodId: entry.foodId ?? "", quantity: entry.quantity ?? 0 }
    : { id: entry.id, kind: "meal", mealId: entry.mealId ?? "" };
}

export async function removeEntry(date: string, entryId: string): Promise<void> {
  await request<void>(`/api/days/${date}/entries/${encodeURIComponent(entryId)}`, { method: "DELETE" });
}
