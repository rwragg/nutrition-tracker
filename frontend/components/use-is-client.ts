"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/**
 * True once React runs in the browser. Every figure on screen comes from "now",
 * which a prerendered page cannot know, so the app renders client-side only.
 */
export function useIsClient(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
