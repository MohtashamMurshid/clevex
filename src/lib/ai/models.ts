import type { ProviderId } from "../types";

export type ModelOption = { id: string; label: string; provider: ProviderId; hint?: string };

export const MODELS: ModelOption[] = [
  { id: "gpt-6.1-sol", label: "GPT-6.1 Sol", provider: "chatgpt", hint: "Most capable" },
  { id: "gpt-6.1-terra", label: "GPT-6.1 Terra", provider: "chatgpt", hint: "Balanced" },
  { id: "gpt-6-luna", label: "GPT-6 Luna", provider: "chatgpt", hint: "Fast" },
  { id: "gpt-6-astra", label: "GPT-6 Astra", provider: "chatgpt" },
  { id: "claude-opus-5-5", label: "Claude Opus 5.5", provider: "claude", hint: "Most capable" },
  { id: "claude-sonnet-5-5", label: "Claude Sonnet 5.5", provider: "claude", hint: "Balanced" },
  { id: "claude-haiku-5-5", label: "Claude Haiku 5.5", provider: "claude", hint: "Fast" },
  { id: "claude-fable-5-2", label: "Claude Fable 5.2", provider: "claude", hint: "Deepest reasoning" },
];

export function providerOf(model: string): ProviderId {
  return model.startsWith("claude") ? "claude" : "chatgpt";
}

export function modelLabel(model: string) {
  return MODELS.find((m) => m.id === model)?.label ?? model;
}

/** Cheap/fast model per provider for small inline jobs. */
export function fastModel(provider: ProviderId) {
  return provider === "claude" ? "claude-sonnet-5-5" : "gpt-6.1-terra";
}
