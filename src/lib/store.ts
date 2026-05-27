import { useSyncExternalStore } from "react";
import type { Team } from "./types";

const TEAMS_KEY = "dota-balancer:teams";

/** Persist the balanced teams so the bracket page can pick them up. */
export function saveTeams(teams: Team[]): void {
  try {
    localStorage.setItem(TEAMS_KEY, JSON.stringify(teams));
  } catch {
    // localStorage may be unavailable (private mode) — fail silently.
  }
}

export function loadTeams(): Team[] | null {
  try {
    const raw = localStorage.getItem(TEAMS_KEY);
    return parse(raw);
  } catch {
    return null;
  }
}

export function clearTeams(): void {
  try {
    localStorage.removeItem(TEAMS_KEY);
  } catch {
    // ignore
  }
}

function parse(raw: string | null): Team[] | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Team[];
    return Array.isArray(value) && value.length > 0 ? value : null;
  } catch {
    return null;
  }
}

// --- React subscription -----------------------------------------------------
// Cache the parsed snapshot so useSyncExternalStore gets a stable reference
// while the underlying string is unchanged.
let cachedRaw: string | null = null;
let cachedTeams: Team[] | null = null;

function getSnapshot(): Team[] | null {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(TEAMS_KEY);
  } catch {
    raw = null;
  }
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cachedTeams = parse(raw);
  }
  return cachedTeams;
}

/** `undefined` during SSR / hydration so the UI can show a loading state. */
function getServerSnapshot(): undefined {
  return undefined;
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}

/** Read the saved teams reactively: `undefined` = loading, `null` = none saved. */
export function useTeams(): Team[] | null | undefined {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
