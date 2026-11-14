import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const compiler = v.union(
  v.literal("tectonic"),
  v.literal("pdflatex"),
  v.literal("xelatex"),
  v.literal("lualatex"),
);

export const chatImage = v.object({
  mime: v.string(),
  name: v.optional(v.string()),
  storageId: v.id("_storage"),
});

export const chatMessage = v.object({
  id: v.string(),
  role: v.union(v.literal("user"), v.literal("assistant")),
  text: v.string(),
  images: v.optional(v.array(chatImage)),
  thinking: v.optional(v.string()),
  model: v.optional(v.string()),
  provider: v.optional(v.union(v.literal("chatgpt"), v.literal("claude"))),
  error: v.optional(v.string()),
  createdAt: v.number(),
  applied: v.optional(
    v.record(v.string(), v.union(v.literal("applied"), v.literal("rejected"), v.literal("failed"))),
  ),
});

export default defineSchema({
  projects: defineTable({
    ownerId: v.string(),
    name: v.string(),
    mainFile: v.string(),
    template: v.string(),
    compiler,
    accent: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_owner", ["ownerId", "updatedAt"]),

  /** Text files keep their content inline; binary files live in file storage. */
  files: defineTable({
    ownerId: v.string(),
    projectId: v.id("projects"),
    path: v.string(),
    content: v.optional(v.string()),
    storageId: v.optional(v.id("_storage")),
    mime: v.optional(v.string()),
    updatedAt: v.number(),
  })
    .index("by_project_path", ["projectId", "path"])
    .index("by_storage", ["storageId"]),

  /** Chat threads; `key` is the client-generated id so the UI can save optimistically. */
  threads: defineTable({
    ownerId: v.string(),
    projectId: v.id("projects"),
    key: v.string(),
    title: v.string(),
    messages: v.array(chatMessage),
    updatedAt: v.number(),
  })
    .index("by_key", ["key"])
    .index("by_project", ["projectId", "updatedAt"]),
});
