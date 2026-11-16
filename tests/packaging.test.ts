import { readFileSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("..", import.meta.url));
const manifest = () =>
  JSON.parse(readFileSync(`${root}/package.json`, "utf8")) as {
    dependencies?: Record<string, string>;
    peerDependencies?: Record<string, string>;
    exports: Record<string, unknown>;
    files: string[];
    scripts: Record<string, string>;
    main: string;
    module: string;
    types: string;
  };

/*
 * The chat thread log is what fancy-chat-php projects Prism Harness runs into
 * (and what a Node twin will). It is read in browsers and workers too, so it
 * stays dependency-free and imports only its own modules. That is about where it
 * runs, not about Prism: the 0.1 "no Prism" check is gone (owner, 2026-11-16).
 */
describe("the contract package", () => {
  it("has zero runtime dependencies at all", () => {
    expect(manifest().dependencies ?? {}).toEqual({});
    expect(manifest().peerDependencies ?? {}).toEqual({});
  });

  it("imports nothing but its own modules and the contract JSON", () => {
    const sources = readdirSync(`${root}/src`).filter((f) => f.endsWith(".ts"));
    expect(sources.length).toBeGreaterThan(5);
    for (const file of sources) {
      const text = readFileSync(`${root}/src/${file}`, "utf8");
      for (const m of text.matchAll(/from\s+"([^"]+)"/g)) expect(m[1], `${file} imports ${m[1]}`).toMatch(/^\.\.?\//);
    }
  });

  it("no longer ships the no-Prism packaging check", () => {
    const m = manifest();
    expect(Object.keys(m.exports)).not.toContain("./scripts/check-no-prism.mjs");
    expect(m.files).not.toContain("scripts/check-no-prism.mjs");
    expect(m.scripts["check:no-prism"]).toBeUndefined();
  });
});

describe("installs from git without building", () => {
  it("has no prepare script, so npm installs no devDependencies and runs no build for a git dependency", () => {
    expect(manifest().scripts.prepare).toBeUndefined();
    expect(manifest().scripts.prepack).toBeUndefined();
  });

  it("commits dist: every entry file the manifest names is tracked by git", () => {
    const tracked = execFileSync("git", ["ls-files", "dist"], { cwd: root, encoding: "utf8" }).split(/\r?\n/).filter(Boolean);
    const m = manifest();
    for (const entry of [m.main, m.module, m.types]) expect(tracked, entry).toContain(entry.replace(/^\.\//, ""));
  });
});
