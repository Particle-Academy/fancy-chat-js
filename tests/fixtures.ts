import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const FIXTURES_PATH = fileURLToPath(new URL("../conformance/chat-v1.json", import.meta.url));
export const MACHINES_PATH = fileURLToPath(new URL("../contract/machines.json", import.meta.url));

// Pinned here AND in fancy-chat-php. A copy that drifts in either repository
// fails that repository's suite, so "the same fixtures" is a test result rather
// than a promise. Hashed with CRLF folded to LF, so a Windows checkout with
// autocrlf reads the same bytes as Linux CI (.gitattributes also pins LF).
export const FIXTURES_SHA256 = "6cde3f5c90f2210e56e0709779b7ae59586df4c013965bf552f1161c5631836a";
export const MACHINES_SHA256 = "78959500f6db660cc3b13c808033468edd2dfa5d9d89e30e9d60f0696764c142";

export const sha256 = (bytes: Buffer) =>
  createHash("sha256").update(bytes.toString("latin1").split("\r\n").join("\n"), "latin1").digest("hex");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const FIXTURES: any = JSON.parse(readFileSync(FIXTURES_PATH, "utf8"));

/** Fixture cases as `[label, case]` rows for `it.each`. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function named(list: any[], label: (c: any, i: number) => string): [string, any][] {
  return list.map((c, i) => [label(c, i), c]);
}

/** A projection case event, with the section's defaults filled in. */
export function withDefaults(defaults: Record<string, unknown>, event: Record<string, unknown>): Record<string, unknown> {
  return { ...defaults, ...event };
}
