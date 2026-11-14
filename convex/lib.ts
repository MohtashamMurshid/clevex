import { ConvexError } from "convex/values";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";

/** The Better Auth user id of the caller. Throws when signed out. */
export async function requireUserId(ctx: QueryCtx | MutationCtx): Promise<string> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new ConvexError("Not signed in");
  return identity.subject;
}

export async function requireProject(ctx: QueryCtx | MutationCtx, projectId: Id<"projects">) {
  const userId = await requireUserId(ctx);
  const project = await ctx.db.get(projectId);
  if (!project || project.ownerId !== userId) throw new ConvexError("Project not found");
  return { userId, project };
}

/** Delete a stored blob unless another file still points at it (duplicated projects share blobs). */
export async function releaseBlob(ctx: MutationCtx, storageId: Id<"_storage"> | undefined, exceptFileId?: Id<"files">) {
  if (!storageId) return;
  const users = await ctx.db
    .query("files")
    .withIndex("by_storage", (q) => q.eq("storageId", storageId))
    .take(2);
  if (users.some((f) => f._id !== exceptFileId)) return;
  await ctx.storage.delete(storageId);
}

export const MAX_TEXT_FILE = 900_000;
