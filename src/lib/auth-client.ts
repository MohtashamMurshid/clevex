"use client";

import { convexClient } from "@convex-dev/better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

/** Better Auth client. Requests go to /api/auth/* on this origin, which proxies to Convex. */
export const authClient = createAuthClient({
  plugins: [convexClient()],
});
