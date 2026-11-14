"use client";

import { useSyncExternalStore } from "react";

/**
 * Credentials live in this browser only (localStorage). The server routes are
 * stateless proxies: every request carries the caller's own token, so a
 * deployed clevex never holds anyone's subscription.
 */

export type ChatGPTCredential = {
  kind: "chatgpt-oauth";
  accessToken: string;
  refreshToken?: string;
  idToken?: string;
  accountId?: string;
  email?: string;
  plan?: string;
  expiresAt?: number; // ms epoch
  /** "oauth" = our own login (safe to refresh); "import" = borrowed from Codex CLI. */
  source: "oauth" | "import";
};

export type ClaudeCredential =
  | {
      kind: "claude-oauth";
      accessToken: string;
      refreshToken?: string;
      expiresAt?: number;
      email?: string;
      plan?: string;
      source: "oauth" | "import" | "setup-token";
    }
  | { kind: "anthropic-key"; apiKey: string; source: "key" };

export type Credentials = {
  chatgpt?: ChatGPTCredential;
  claude?: ClaudeCredential;
};

const KEY = "clevex.credentials.v1";
const listeners = new Set<() => void>();
let cache: Credentials | null = null;
const EMPTY: Credentials = {};

function read(): Credentials {
  if (typeof window === "undefined") return EMPTY;
  if (cache) return cache;
  try {
    cache = JSON.parse(localStorage.getItem(KEY) || "{}") as Credentials;
  } catch {
    cache = {};
  }
  return cache;
}

export function getCredentials(): Credentials {
  return read();
}

export function setCredentials(update: (c: Credentials) => Credentials) {
  const next = update({ ...read() });
  cache = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* storage may be unavailable; keep in memory */
  }
  listeners.forEach((l) => l());
}

export function useCredentials(): Credentials {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      const onStorage = (e: StorageEvent) => {
        if (e.key === KEY) {
          cache = null;
          cb();
        }
      };
      window.addEventListener("storage", onStorage);
      return () => {
        listeners.delete(cb);
        window.removeEventListener("storage", onStorage);
      };
    },
    read,
    () => EMPTY,
  );
}

export function decodeJwt(token: string): Record<string, unknown> | null {
  try {
    const part = token.split(".")[1];
    const b64 = part.replace(/-/g, "+").replace(/_/g, "/");
    const json = decodeURIComponent(
      atob(b64 + "===".slice((b64.length + 3) % 4))
        .split("")
        .map((c) => "%" + c.charCodeAt(0).toString(16).padStart(2, "0"))
        .join(""),
    );
    return JSON.parse(json);
  } catch {
    return null;
  }
}
