"use client";

import { useSyncExternalStore } from "react";
import type { Effort } from "./ai/wire";

export type Settings = {
  model: string;
  effort: Effort;
  theme: "system" | "light" | "dark";
  autoCompile: boolean;
  editorFontSize: number;
};

const DEFAULTS: Settings = {
  model: "claude-opus-5-5",
  effort: "medium",
  theme: "system",
  autoCompile: true,
  editorFontSize: 13.5,
};

const KEY = "clevex.settings.v1";
const listeners = new Set<() => void>();
let cache: Settings | null = null;

function read(): Settings {
  if (typeof window === "undefined") return DEFAULTS;
  if (cache) return cache;
  try {
    cache = { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || "{}") };
  } catch {
    cache = DEFAULTS;
  }
  return cache!;
}

export function getSettings() {
  return read();
}

export function updateSettings(patch: Partial<Settings>) {
  cache = { ...read(), ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(cache));
  } catch {
    /* ignore */
  }
  if (patch.theme) applyTheme(cache.theme);
  listeners.forEach((l) => l());
}

export function useSettings(): Settings {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    read,
    () => DEFAULTS,
  );
}

export function applyTheme(theme: Settings["theme"]) {
  const dark =
    theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
}

/** Keep "system" theme in sync with the OS. Returns an unsubscribe. */
export function watchSystemTheme() {
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  const onChange = () => {
    if (read().theme === "system") applyTheme("system");
  };
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}
