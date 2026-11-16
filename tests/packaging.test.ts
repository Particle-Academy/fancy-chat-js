import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// @ts-expect-error -- a plain .mjs script with no declaration file
import { checkNoPrism } from "../scripts/check-no-prism.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const control = fileURLToPath(new URL("./packaging-fixtures/uses-prism", import.meta.url));

describe("no Prism in the core (owner 2026-11-15)", () => {
  it("finds no prism dependency, import or bundled module in this package", () => {
    const { findings, visited } = checkNoPrism(root);
    expect(visited.manifest).toBe(true);
    expect(visited.sources).toBeGreaterThan(5);
    expect(findings).toEqual([]);
  });

  it("fires on every input of a package that does use Prism (negative control)", () => {
    const { findings, visited } = checkNoPrism(control);
    expect(visited).toEqual({ manifest: true, sources: 1, metafiles: 1 });
    expect(findings).toEqual([
      "package.json peerDependencies: @particle-academy/prism-acp",
      expect.stringMatching(/adapter\.js imports @particle-academy\/prism-acp$/),
      "metafile-esm.json: src/adapter.js imports @particle-academy/prism-acp",
    ]);
  });

  it("has zero runtime dependencies at all", () => {
    const manifest = JSON.parse(readFileSync(`${root}/package.json`, "utf8"));
    expect(manifest.dependencies ?? {}).toEqual({});
    expect(manifest.peerDependencies ?? {}).toEqual({});
  });

  it("imports nothing but its own modules and the contract JSON", () => {
    const { visited } = checkNoPrism(root);
    expect(visited.sources).toBeGreaterThan(0);
    for (const file of ["events", "hitl", "machines", "parts", "projection", "sequence", "status", "types", "index"]) {
      const text = readFileSync(`${root}/src/${file}.ts`, "utf8");
      for (const m of text.matchAll(/from\s+"([^"]+)"/g)) expect(m[1]).toMatch(/^\.\.?\//);
    }
  });
});


describe("installs from git without building", () => {
  it("has no prepare script, so npm installs no devDependencies and runs no build for a git dependency", () => {
    const manifest = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { scripts: Record<string, string> };
    expect(manifest.scripts.prepare).toBeUndefined();
    expect(manifest.scripts.prepack).toBeUndefined();
  });

  it("commits dist: every entry file the manifest names is tracked by git", () => {
    const tracked = execFileSync("git", ["ls-files", "dist"], { cwd: fileURLToPath(new URL("..", import.meta.url)), encoding: "utf8" }).split(/\r?\n/).filter(Boolean);
    const manifest = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { main: string; module: string; types: string };
    for (const entry of [manifest.main, manifest.module, manifest.types]) expect(tracked, entry).toContain(entry.replace(/^\.\//, ""));
  });
});
