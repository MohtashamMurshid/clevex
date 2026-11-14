export type ProjectFile = {
  path: string;
  /** Text content for text files. */
  content?: string;
  /** Base64 data for binary files (images, PDFs). */
  data?: string;
  mime?: string;
  /** Convex file storage id for binary files that have been uploaded. */
  storageId?: string;
  updatedAt: number;
};

export type Project = {
  id: string;
  name: string;
  mainFile: string;
  createdAt: number;
  updatedAt: number;
  /** Emoji-free accent so cards look distinct; index into a palette. */
  accent: number;
  template: string;
  compiler: "tectonic" | "pdflatex" | "xelatex" | "lualatex";
};

export type ProviderId = "chatgpt" | "claude";

export type ChatImage = {
  mime: string;
  name?: string;
  /** Base64 bytes, present for images attached in this session (sent to the model). */
  data?: string;
  /** Present once uploaded to Convex file storage. */
  storageId?: string;
  /** Signed URL for display after reload. */
  url?: string;
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  images?: ChatImage[];
  thinking?: string;
  model?: string;
  provider?: ProviderId;
  error?: string;
  createdAt: number;
  /** Edit block ids that were applied (by index within the message). */
  applied?: Record<string, "applied" | "rejected" | "failed">;
};

export type ChatThread = {
  id: string;
  projectId: string;
  title: string;
  messages: ChatMessage[];
  updatedAt: number;
};

export type CompileError = {
  file?: string;
  line?: number;
  message: string;
  level: "error" | "warning";
  context?: string;
};

export type CompileResult = {
  ok: boolean;
  pdf?: string; // base64
  log: string;
  errors: CompileError[];
  engine: string;
  durationMs: number;
};
