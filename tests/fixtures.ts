import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const FIXTURES_PATH = fileURLToPath(new URL("../conformance/chat-v1.json", import.meta.url));
export const MACHINES_PATH = fileURLToPath(new URL("../contract/machines.json", import.meta.url));

// Pinned here AND in fancy-chat-php. A copy that drifts in either repository
// fails that repository's suite, so "the same fixtures" is a test result rather
// than a promise. Hashed with CRLF folded to LF, so a Windows checkout with
// autocrlf reads the same bytes as Linux CI (.gitattributes also pins LF).
export const FIXTURES_SHA256 = "9e72d5b5896698d7fa75187725912e0b00d15b06a08cd38b38f66f6b43ee55f0";
export const MACHINES_SHA256 = "55db613b7bffa251544a7d8303bca8187e954b851b646d27f9e1a4c4393e4f81";

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
