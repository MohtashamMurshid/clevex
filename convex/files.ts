import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { MAX_TEXT_FILE, releaseBlob, requireProject, requireUserId } from "./lib";

export const list = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) => {
    await requireProject(ctx, projectId);
    const rows = await ctx.db
      .query("files")
      .withIndex("by_project_path", (q) => q.eq("projectId", projectId))
      .collect();
    return Promise.all(
      rows.map(async (f) => ({
        path: f.path,
        content: f.content,
        mime: f.mime,
        storageId: f.storageId,
        url: f.storageId ? await ctx.storage.getUrl(f.storageId) : undefined,
        updatedAt: f.updatedAt,
      })),
    );
  },
});

/** Create or replace a file. Pass `content` for text files or `storageId` for uploaded binaries. */
export const put = mutation({
  args: {
    projectId: v.id("projects"),
    path: v.string(),
    content: v.optional(v.string()),
    storageId: v.optional(v.id("_storage")),
    mime: v.optional(v.string()),
  },
  handler: async (ctx, { projectId, path, content, storageId, mime }) => {
    const { userId } = await requireProject(ctx, projectId);
    if ((content?.length ?? 0) > MAX_TEXT_FILE) throw new ConvexError(`${path} is too large to save`);
    const now = Date.now();
    const existing = await ctx.db
      .query("files")
      .withIndex("by_project_path", (q) => q.eq("projectId", projectId).eq("path", path))
      .unique();
    if (existing) {
      const oldBlob = existing.storageId;
      await ctx.db.replace(existing._id, {
        ownerId: userId,
        projectId,
        path,
        content,
        storageId,
        mime,
        updatedAt: now,
      });
      if (oldBlob && oldBlob !== storageId) await releaseBlob(ctx, oldBlob, existing._id);
    } else {
      await ctx.db.insert("files", { ownerId: userId, projectId, path, content, storageId, mime, updatedAt: now });
    }
    await ctx.db.patch(projectId, { updatedAt: now });
  },
});

export const remove = mutation({
  args: { projectId: v.id("projects"), path: v.string() },
  handler: async (ctx, { projectId, path }) => {
    const { project } = await requireProject(ctx, projectId);
    if (path === project.mainFile) throw new ConvexError("Can't delete the main file");
    const f = await ctx.db
      .query("files")
      .withIndex("by_project_path", (q) => q.eq("projectId", projectId).eq("path", path))
      .unique();
    if (!f) return;
    await ctx.db.delete(f._id);
    await releaseBlob(ctx, f.storageId);
    await ctx.db.patch(projectId, { updatedAt: Date.now() });
  },
});

export const rename = mutation({
  args: { projectId: v.id("projects"), from: v.string(), to: v.string() },
  handler: async (ctx, { projectId, from, to }) => {
    const { project } = await requireProject(ctx, projectId);
    if (from === to) return;
    const clash = await ctx.db
      .query("files")
      .withIndex("by_project_path", (q) => q.eq("projectId", projectId).eq("path", to))
      .unique();
    if (clash) throw new ConvexError(`${to} already exists`);
    const f = await ctx.db
      .query("files")
      .withIndex("by_project_path", (q) => q.eq("projectId", projectId).eq("path", from))
      .unique();
    if (!f) return;
    const now = Date.now();
    await ctx.db.patch(f._id, { path: to, updatedAt: now });
    await ctx.db.patch(projectId, {
      updatedAt: now,
      ...(project.mainFile === from ? { mainFile: to } : {}),
    });
  },
});

/** Short-lived URL the browser POSTs a binary file (image, PDF figure) to. */
export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireUserId(ctx);
    return ctx.storage.generateUploadUrl();
  },
});
