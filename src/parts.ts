import { isPlainObject } from "./events";
import type { Part, Result } from "./types";

export const CORE_PART_KINDS = [
  "text",
  "code",
  "table",
  "chart",
  "file",
  "image",
  "tool-call",
  "tool-result",
  "card",
  "question",
  "approval",
] as const;

export const CHART_TYPES = ["line", "bar", "area", "pie", "scatter"] as const;

const CORE = new Set<string>(CORE_PART_KINDS);
const EXTENSION_KIND = /^x-[a-z0-9][a-z0-9-]*\.[a-z0-9][a-z0-9._-]*$/;

export interface PartLimits {
  /** JSON byte size of one part, nested parts included. Default 65536. */
  maxPartBytes: number;
  /** Card nesting depth, the outermost part being 1. Default 3. */
  maxDepth: number;
  /** Parts in one message. Default 64. */
  maxParts: number;
}

export const DEFAULT_PART_LIMITS: PartLimits = { maxPartBytes: 65536, maxDepth: 3, maxParts: 64 };

/** Who authored the part. Only server code may place HITL parts or raw ECharts options. */
export type PartOrigin = "agent" | "server";

export interface PartDefinition<P extends Part = Part> {
  /** `x-<app>.<name>`. Core kinds cannot be redefined. */
  kind: string;
  validate?: (part: P) => boolean | string;
  toText?: (part: P) => string;
}

export interface PartRegistry {
  register<P extends Part>(definition: PartDefinition<P>): PartRegistry;
  get(kind: string): PartDefinition | undefined;
  kinds(): string[];
}

export function createPartRegistry(definitions: PartDefinition[] = []): PartRegistry {
  const map = new Map<string, PartDefinition>();
  const registry: PartRegistry = {
    register(definition) {
      if (CORE.has(definition.kind)) throw new TypeError(`Core part kind "${definition.kind}" cannot be redefined.`);
      if (!EXTENSION_KIND.test(definition.kind)) throw new TypeError("An app part kind must be named x-<app>.<name>.");
      if (map.has(definition.kind)) throw new TypeError(`Part kind "${definition.kind}" is already registered.`);
      map.set(definition.kind, definition as PartDefinition);
      return registry;
    },
    get: (kind) => map.get(kind),
    kinds: () => [...map.keys()],
  };
  for (const d of definitions) registry.register(d);
  return registry;
}

export interface PartContext {
  origin: PartOrigin;
  limits?: Partial<PartLimits>;
  registry?: PartRegistry;
}

const str = (v: unknown): v is string => typeof v === "string";
const optStr = (v: unknown) => v === undefined || v === null || typeof v === "string";
const optNum = (v: unknown) => v === undefined || v === null || (typeof v === "number" && Number.isFinite(v));

/** JSON byte size, the same measure fancy-chat-php uses (unescaped slashes and unicode). */
export function jsonBytes(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).length;
}

function fail(error: string): Result {
  return { ok: false, error };
}

function validateAt(input: unknown, ctx: PartContext, limits: PartLimits, depth: number): Result {
  if (depth > limits.maxDepth) return fail("part.depth");
  if (!isPlainObject(input)) return fail("part.shape");
  const p = input as Part;
  if (!str(p.id) || p.id === "") return fail("part.id");
  if (depth === 1 && jsonBytes(p) > limits.maxPartBytes) return fail("part.size");
  if (!str(p.kind)) return fail("part.kind");

  if (!CORE.has(p.kind)) {
    if (!EXTENSION_KIND.test(p.kind)) return fail("part.kind");
    const def = ctx.registry?.get(p.kind);
    if (def?.validate) {
      const verdict = def.validate(p);
      if (verdict !== true) return fail(typeof verdict === "string" ? verdict : `part.${p.kind}`);
    }
    return { ok: true };
  }

  switch (p.kind) {
    case "text":
      return (p.format === "markdown" || p.format === "plain") && str(p.text) && (p.interim === undefined || typeof p.interim === "boolean")
        ? { ok: true }
        : fail("part.text");
    case "code":
      return str(p.language) && str(p.code) && optStr(p.filename) ? { ok: true } : fail("part.code");
    case "table": {
      const cols = p.columns;
      if (!Array.isArray(cols) || !Array.isArray(p.rows) || !optStr(p.caption)) return fail("part.table");
      const colsOk = cols.every((c) => isPlainObject(c) && str(c.key) && c.key !== "" && str(c.label) && optStr(c.type));
      const rowsOk = (p.rows as unknown[]).every(isPlainObject);
      return colsOk && rowsOk ? { ok: true } : fail("part.table");
    }
    case "chart": {
      if (!optStr(p.title)) return fail("part.chart");
      if (p.echarts !== undefined) {
        // Raw ECharts options run arbitrary formatter strings and styling; they
        // are accepted only from trusted server code, never from a model.
        if (ctx.origin !== "server") return fail("part.chart.raw");
        return isPlainObject(p.echarts) ? { ok: true } : fail("part.chart");
      }
      const spec = p.spec;
      if (!isPlainObject(spec) || !str(spec.type) || !(CHART_TYPES as readonly string[]).includes(spec.type)) return fail("part.chart");
      if (!Array.isArray(spec.series) || !spec.series.every((s) => isPlainObject(s) && Array.isArray(s.data) && optStr(s.name))) {
        return fail("part.chart");
      }
      return { ok: true };
    }
    case "file":
      return str(p.name) && str(p.mimeType) && typeof p.size === "number" && Number.isInteger(p.size) && p.size >= 0 && str(p.ref)
        ? { ok: true }
        : fail("part.file");
    case "image":
      return str(p.ref) && str(p.alt) && optNum(p.width) && optNum(p.height) ? { ok: true } : fail("part.image");
    case "tool-call":
      return str(p.toolCallId) && str(p.name) && isPlainObject(p.args) ? { ok: true } : fail("part.tool-call");
    case "tool-result": {
      const outcomeOk = p.outcome === "ok" || p.outcome === "failure" || p.outcome === "refusal";
      const contentOk = str(p.content) || Array.isArray(p.content);
      return str(p.toolCallId) && outcomeOk && contentOk && optNum(p.durationMs) ? { ok: true } : fail("part.tool-result");
    }
    case "card": {
      if (!str(p.cardType) || !optStr(p.title) || !Array.isArray(p.body)) return fail("part.card");
      if (p.fields !== undefined && !(Array.isArray(p.fields) && p.fields.every((f) => isPlainObject(f) && str(f.label) && str(f.value)))) {
        return fail("part.card");
      }
      if (p.actions !== undefined) {
        if (!Array.isArray(p.actions)) return fail("part.card.action");
        for (const a of p.actions) {
          if (!isPlainObject(a) || !str(a.id) || !str(a.label)) return fail("part.card.action");
          if (a.kind === "link") {
            if (!str(a.href) || !/^https?:\/\//i.test(a.href)) return fail("part.card.action");
          } else if (a.kind !== "post-back") {
            return fail("part.card.action");
          }
        }
      }
      for (const child of p.body as unknown[]) {
        const r = validateAt(child, ctx, limits, depth + 1);
        if (!r.ok) return r;
      }
      return { ok: true };
    }
    case "question":
    case "approval": {
      // HITL parts are references into server records; a model can never place one.
      if (ctx.origin !== "server") return fail("part.hitl.origin");
      const ref = p.kind === "question" ? p.questionId : p.approvalId;
      return str(ref) && ref !== "" ? { ok: true } : fail(`part.${p.kind}`);
    }
  }
  return fail("part.kind");
}

/** Validates one part. Unknown core kinds fail; `x-*` kinds pass unless their registered validator refuses. */
export function validatePart(part: unknown, context: PartContext): Result {
  const limits = { ...DEFAULT_PART_LIMITS, ...(context.limits ?? {}) };
  return validateAt(part, context, limits, 1);
}

/** Validates a message's parts: the count cap, then each part. */
export function validateParts(parts: unknown, context: PartContext): Result {
  const limits = { ...DEFAULT_PART_LIMITS, ...(context.limits ?? {}) };
  if (!Array.isArray(parts)) return fail("message.parts");
  if (parts.length > limits.maxParts) return fail("message.parts.count");
  for (const part of parts) {
    const r = validateAt(part, context, limits, 1);
    if (!r.ok) return r;
  }
  return { ok: true };
}

const FENCE = "```";

/**
 * Plain text for a part: copy, notifications, storage, and the fallback render
 * of a kind the client does not know. Never empty-drops a part.
 */
export function partToText(part: Part, registry?: PartRegistry): string {
  switch (part.kind) {
    case "text":
      return String(part.text ?? "");
    case "code":
      return `${FENCE}${String(part.language ?? "")}\n${String(part.code ?? "")}\n${FENCE}`;
    case "table": {
      const cols = (part.columns as { key: string; label: string }[]) ?? [];
      const cell = (v: unknown) => (v === undefined || v === null ? "" : String(v)).replace(/[\t\n\r]/g, " ");
      const lines = [cols.map((c) => cell(c.label)).join("\t")];
      for (const row of (part.rows as Record<string, unknown>[]) ?? []) lines.push(cols.map((c) => cell(row[c.key])).join("\t"));
      return lines.join("\n");
    }
    case "chart":
      return typeof part.title === "string" && part.title !== "" ? `[chart: ${part.title}]` : "[chart]";
    case "file":
      return `[file: ${String(part.name ?? "")}]`;
    case "image":
      return `[image: ${String(part.alt ?? "")}]`;
    case "tool-call":
      return `[tool: ${String(part.name ?? "")}]`;
    case "tool-result":
      return typeof part.content === "string" ? part.content : `[tool result: ${String(part.outcome ?? "")}]`;
    case "card": {
      const lines: string[] = [];
      if (typeof part.title === "string" && part.title !== "") lines.push(part.title);
      for (const child of (part.body as Part[]) ?? []) {
        const t = partToText(child, registry);
        if (t !== "") lines.push(t);
      }
      return lines.join("\n");
    }
    case "question":
      return "[question]";
    case "approval":
      return "[approval]";
  }
  const def = registry?.get(part.kind);
  return def?.toText ? def.toText(part) : `[${part.kind}]`;
}
