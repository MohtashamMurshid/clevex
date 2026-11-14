"use client";

import { ConvexReactClient } from "convex/react";

/** One Convex client for the whole app (React provider + imperative calls in lib/db). */
export const convex = new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL!, {
  // Wait for the auth token before running queries so the first load isn't anonymous.
  expectAuth: true,
});
