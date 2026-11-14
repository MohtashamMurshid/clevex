import { createClient, type GenericCtx } from "@convex-dev/better-auth";
import { convex } from "@convex-dev/better-auth/plugins";
import { betterAuth } from "better-auth/minimal";
import { APIError } from "better-auth/api";
import { components } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import { query } from "./_generated/server";
import authConfig from "./auth.config";

/**
 * Deployment env (set per Convex deployment):
 *   SITE_URL             public origin of the Next.js app (http://localhost:3000 in dev)
 *   BETTER_AUTH_SECRET   random secret, different for dev and prod
 *   TRUSTED_ORIGINS      optional, comma-separated extra origins (e.g. Vercel previews)
 *   AUTH_ALLOWED_EMAILS  optional, comma-separated allowlist; when set, only these
 *                        emails can create an account
 */
const siteUrl = process.env.SITE_URL!;

export const authComponent = createClient<DataModel>(components.betterAuth);

function allowedEmails() {
  return (process.env.AUTH_ALLOWED_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export const createAuth = (ctx: GenericCtx<DataModel>) => {
  const extraOrigins = (process.env.TRUSTED_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  return betterAuth({
    appName: "clevex",
    baseURL: siteUrl,
    trustedOrigins: [siteUrl, ...extraOrigins],
    database: authComponent.adapter(ctx),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false,
      minPasswordLength: 8,
    },
    session: {
      expiresIn: 60 * 60 * 24 * 30,
      updateAge: 60 * 60 * 24,
    },
    databaseHooks: {
      user: {
        create: {
          before: async (user) => {
            const allow = allowedEmails();
            if (allow.length && !allow.includes(user.email.toLowerCase())) {
              throw new APIError("FORBIDDEN", { message: "Sign-ups are closed on this clevex." });
            }
            return { data: user };
          },
        },
      },
    },
    plugins: [convex({ authConfig })],
  });
};

/** The signed-in user, or null. */
export const getCurrentUser = query({
  args: {},
  handler: async (ctx) => {
    return (await authComponent.safeGetAuthUser(ctx)) ?? null;
  },
});
