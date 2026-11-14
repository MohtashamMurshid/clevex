import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireProject, requireUserId } from "./lib";
import { chatMessage } from "./schema";

export const list = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) => {
    await requireProject(ctx, projectId);
    const rows = await ctx.db
      .query("threads")
      .withIndex("by_project", (q) => q.eq("projectId", projectId))
      .order("desc")
      .take(100);
    return Promise.all(
      rows.map(async (t) => ({
        id: t.key,
        projectId: t.projectId,
        title: t.title,
        updatedAt: t.updatedAt,
        messages: await Promise.all(
          t.messages.map(async (m) => ({
            ...m,
            images: m.images
              ? await Promise.all(
                  m.images.map(async (img) => ({ ...img, url: (await ctx.storage.getUrl(img.storageId)) ?? undefined })),
                )
              : undefined,
          })),
        ),
      })),
    );
  },
});

/** Upsert a whole thread by its client key. */
export const save = mutation({
  args: {
    key: v.string(),
    projectId: v.id("projects"),
    title: v.string(),
    messages: v.array(chatMessage),
  },
  handler: async (ctx, { key, projectId, title, messages }) => {
    const { userId } = await requireProject(ctx, projectId);
    const now = Date.now();
    const existing = await ctx.db
      .query("threads")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique();
    if (existing) {
      if (existing.ownerId !== userId) throw new ConvexError("Thread not found");
      // Drop blobs for images that are no longer referenced.
      const keep = new Set(messages.flatMap((m) => (m.images ?? []).map((i) => i.storageId)));
      for (const m of existing.messages) {
        for (const img of m.images ?? []) if (!keep.has(img.storageId)) await ctx.storage.delete(img.storageId);
      }
      await ctx.db.patch(existing._id, { title: title.slice(0, 120), messages, updatedAt: now });
    } else {
      await ctx.db.insert("threads", {
        ownerId: userId,
        projectId,
        key,
        title: title.slice(0, 120),
        messages,
        updatedAt: now,
      });
    }
  },
});

export const remove = mutation({
  args: { key: v.string() },
  handler: async (ctx, { key }) => {
    const userId = await requireUserId(ctx);
    const t = await ctx.db
      .query("threads")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique();
    if (!t || t.ownerId !== userId) return;
    for (const m of t.messages) for (const img of m.images ?? []) await ctx.storage.delete(img.storageId);
    await ctx.db.delete(t._id);
  },
});
