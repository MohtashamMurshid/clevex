"use client";

import { useEffect, useState } from "react";

export type ServerConfig = {
  local: boolean;
  serverClaude: boolean;
  serverChatGPT: boolean;
  onVercel: boolean;
};

const FALLBACK: ServerConfig = {
  local: false,
  serverClaude: false,
  serverChatGPT: false,
  onVercel: false,
};

let promise: Promise<ServerConfig> | null = null;

export function getServerConfig(): Promise<ServerConfig> {
  promise ??= fetch("/api/config")
    .then((r) => (r.ok ? r.json() : FALLBACK))
    .catch(() => FALLBACK);
  return promise;
}

export function useServerConfig(): ServerConfig | null {
  const [config, setConfig] = useState<ServerConfig | null>(null);
  useEffect(() => {
    let alive = true;
    getServerConfig().then((c) => alive && setConfig(c));
    return () => {
      alive = false;
    };
  }, []);
  return config;
}
