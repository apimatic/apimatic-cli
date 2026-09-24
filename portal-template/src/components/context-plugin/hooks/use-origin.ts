"use client";

import { useSyncExternalStore } from "react";

// The origin never changes for the life of the page, so nothing to subscribe to.
const noSubscribe = () => () => {};

/** Origin on the client, `null` on the server; keeps hydration mismatch-free. */
export function useOrigin(): string | null {
  return useSyncExternalStore(
    noSubscribe,
    () => window.location.origin,
    () => null,
  );
}
