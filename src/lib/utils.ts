import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/** Current time in ms. Wrapped so event handlers can call it without tripping the React purity lint. */
export function now() {
  return Date.now();
}
