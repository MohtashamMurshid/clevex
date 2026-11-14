import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { compiler } from "./schema";
import { MAX_TEXT_FILE, releaseBlob, requireProject, requireUserId } from "./lib";

const fileInput = v.object({
  path: v.string(),
  content: v.optional(v.string()),
  storageId: v.optional(v.id("_storage")),
  mime: v.optional(v.string()),
});

function shape(p: {
  _id: string;
  name: string;
  mainFile: string;
  template: string;
  compiler: "tectonic" | "pdflatex" | "xelatex" | "lualatex";
  accent: number;
  createdAt: number;
  updatedAt: number;
}) {
  return {
    id: p._id,
    name: p.name,
    mainFile: p.mainFile,
    template: p.template,
    compiler: p.compiler,
    accent: p.accent,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

export const list = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    const rows = await ctx.db
      .query("projects")
      .withIndex("by_owner", (q) => q.eq("ownerId", identity.subject))
      .order("desc")
      .take(500);
    return rows.map(shape);
  },
});

export const get = query({
  args: { id: v.string() },
  handler: async (ctx, { id }) => {
    const userId = await requireUserId(ctx);
    const projectId = ctx.db.normalizeId("projects", id);
    if (!projectId) return null;
    const p = await ctx.db.get(projectId);
    if (!p || p.ownerId !== userId) return null;
    return shape(p);
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    template: v.string(),
    mainFile: v.string(),
    compiler: v.optional(compiler),
    accent: v.optional(v.number()),
    files: v.array(fileInput),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const now = Date.now();
    const projectId = await ctx.db.insert("projects", {
      ownerId: userId,
      name: args.name.slice(0, 200) || "Untitled",
      mainFile: args.mainFile,
      template: args.template,
      compiler: args.compiler ?? "pdflatex",
      accent: args.accent ?? Math.floor(Math.random() * 6),
      createdAt: now,
      updatedAt: now,
    });
    const seen = new Set<string>();
    for (const f of args.files) {
      if (seen.has(f.path)) continue;
      seen.add(f.path);
      if ((f.content?.length ?? 0) > MAX_TEXT_FILE) throw new ConvexError(`${f.path} is too large`);
      await ctx.db.insert("files", { ownerId: userId, projectId, ...f, updatedAt: now });
    }
    return projectId;
  },
});

export const update = mutation({
  args: {
    id: v.id("projects"),
    name: v.optional(v.string()),
    mainFile: v.optional(v.string()),
    compiler: v.optional(compiler),
  },
  handler: async (ctx, { id, ...patch }) => {
    await requireProject(ctx, id);
    const clean = Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined));
    await ctx.db.patch(id, { ...clean, updatedAt: Date.now() });
  },
});

export const touch = mutation({
  args: { id: v.id("projects") },
  handler: async (ctx, { id }) => {
    await requireProject(ctx, id);
    await ctx.db.patch(id, { updatedAt: Date.now() });
  },
});

export const duplicate = mutation({
  args: { id: v.id("projects") },
  handler: async (ctx, { id }) => {
    const { userId, project } = await requireProject(ctx, id);
    const now = Date.now();
    const copyId = await ctx.db.insert("projects", {
      ownerId: userId,
      name: `${project.name} (copy)`,
      mainFile: project.mainFile,
      template: project.template,
      compiler: project.compiler,
      accent: (project.accent + 1) % 6,
      createdAt: now,
      updatedAt: now,
    });
    const files = await ctx.db
      .query("files")
      .withIndex("by_project_path", (q) => q.eq("projectId", id))
      .collect();
    for (const f of files) {
      await ctx.db.insert("files", {
        ownerId: userId,
        projectId: copyId,
        path: f.path,
        content: f.content,
        storageId: f.storageId,
        mime: f.mime,
        updatedAt: now,
      });
    }
    return copyId;
  },
});

export const remove = mutation({
  args: { id: v.id("projects") },
  handler: async (ctx, { id }) => {
    await requireProject(ctx, id);
    const files = await ctx.db
      .query("files")
      .withIndex("by_project_path", (q) => q.eq("projectId", id))
      .collect();
    for (const f of files) {
      await ctx.db.delete(f._id);
      await releaseBlob(ctx, f.storageId);
    }
    const threads = await ctx.db
      .query("threads")
      .withIndex("by_project", (q) => q.eq("projectId", id))
      .collect();
    for (const t of threads) {
      for (const m of t.messages) for (const img of m.images ?? []) await ctx.storage.delete(img.storageId);
      await ctx.db.delete(t._id);
    }
    await ctx.db.delete(id);
  },
});
