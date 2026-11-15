import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

/*
 * `fancy-chat-check-install`: a git install under `ignore-scripts=true` skips
 * `prepare`, so the package arrives with no dist and a bundler later says only
 * "failed to resolve entry". A postinstall cannot catch it (ignore-scripts skips
 * that too), so this committed script names every package whose entry files are
 * missing, and why, and exits 1.
 */
const script = fileURLToPath(new URL("../scripts/check-install.mjs", import.meta.url));
let dirs: string[] = [];
afterEach(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
  dirs = [];
});

function host(pkgs: Record<string, { manifest: Record<string, unknown>; files: string[] }>) {
  const root = mkdtempSync(join(tmpdir(), "fc-check-"));
  dirs.push(root);
  for (const [name, { manifest, files }] of Object.entries(pkgs)) {
    const dir = join(root, "node_modules", "@particle-academy", name);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "package.json"), JSON.stringify({ name: `@particle-academy/${name}`, version: "1.0.0", ...manifest }));
    for (const f of files) {
      mkdirSync(join(dir, f, ".."), { recursive: true });
      writeFileSync(join(dir, f), "");
    }
  }
  return root;
}

const run = (cwd: string) => spawnSync(process.execPath, [script], { cwd, encoding: "utf8" });

const manifest = {
  main: "./dist/index.cjs",
  module: "./dist/index.js",
  types: "./dist/index.d.ts",
  exports: { ".": { import: { types: "./dist/index.d.ts", default: "./dist/index.js" }, require: { types: "./dist/index.d.cts", default: "./dist/index.cjs" } }, "./package.json": "./package.json" },
};
const built = ["dist/index.cjs", "dist/index.js", "dist/index.d.ts", "dist/index.d.cts"];

describe("fancy-chat-check-install", () => {
  it("passes when every entry file exists, and says how many it checked", () => {
    const r = run(host({ "fancy-chat-js": { manifest, files: built }, "react-fancy": { manifest, files: built } }));
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("2 @particle-academy packages");
  });

  it("fails loudly, naming the package, the missing file and the likely cause", () => {
    const r = run(host({ "fancy-chat-js": { manifest, files: built }, "fancy-chat-ui": { manifest, files: [] } }));
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("@particle-academy/fancy-chat-ui");
    expect(r.stderr).toContain("dist/index.js");
    expect(r.stderr).toContain("ignore-scripts");
    expect(r.stderr).not.toContain("@particle-academy/fancy-chat-js:");
  });

  it("checks nested exports, not only main", () => {
    const m = { ...manifest, exports: { ...manifest.exports, "./knowledge": { import: { default: "./dist/knowledge.js" } } } };
    const r = run(host({ "fancy-chat-ui": { manifest: m, files: built } }));
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("dist/knowledge.js");
  });

  it("fails, never passes, when it finds nothing to check", () => {
    const root = mkdtempSync(join(tmpdir(), "fc-check-"));
    dirs.push(root);
    const r = run(root);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("no @particle-academy packages");
  });
});
