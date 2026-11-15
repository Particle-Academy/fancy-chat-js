// The no-Prism packaging check (CC-fancy-0042, owner 2026-11-15: "the whole
// prism eco system is an optional addon"). A core chat package may not depend
// on, import, or bundle anything from the Prism ecosystem. Three inputs, each
// machine-readable:
//
//   1. the manifest: no prism* name in any dependency field;
//   2. the source: no import or require specifier containing "prism";
//   3. the built import graph (tsup metafile), when a build exists: no input
//      or import path containing "prism".
//
// A check never seen to fire cannot be told from one that cannot, so the suite
// runs it against a fixture package that DOES use Prism and requires a finding.
//
//   node scripts/check-no-prism.mjs [packageRoot]
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const DEP_FIELDS = ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies", "bundleDependencies", "bundledDependencies"];
const PRISM = /prism/i;
const SPECIFIER = /(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)|require\s*\(\s*['"]([^'"]+)['"]\s*\)|import\s+['"]([^'"]+)['"]/g;

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (/\.(c|m)?(t|j)sx?$/.test(name)) out.push(path);
  }
  return out;
}

/** @returns {{ findings: string[], visited: { manifest: boolean, sources: number, metafiles: number } }} */
export function checkNoPrism(root) {
  const findings = [];
  const visited = { manifest: false, sources: 0, metafiles: 0 };

  const manifestPath = join(root, "package.json");
  if (existsSync(manifestPath)) {
    visited.manifest = true;
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    for (const field of DEP_FIELDS) {
      const deps = manifest[field];
      const names = Array.isArray(deps) ? deps : Object.keys(deps ?? {});
      for (const name of names) if (PRISM.test(name)) findings.push(`package.json ${field}: ${name}`);
    }
  }

  for (const file of walk(join(root, "src"))) {
    visited.sources += 1;
    const text = readFileSync(file, "utf8");
    for (const m of text.matchAll(SPECIFIER)) {
      const spec = m[1] ?? m[2] ?? m[3] ?? m[4];
      if (spec && PRISM.test(spec)) findings.push(`${relative(root, file)} imports ${spec}`);
    }
  }

  const dist = join(root, "dist");
  if (existsSync(dist)) {
    for (const name of readdirSync(dist)) {
      if (!/^metafile-.*\.json$/.test(name)) continue;
      visited.metafiles += 1;
      const meta = JSON.parse(readFileSync(join(dist, name), "utf8"));
      for (const [input, info] of Object.entries(meta.inputs ?? {})) {
        if (PRISM.test(input)) findings.push(`${name}: bundles ${input}`);
        for (const imp of info.imports ?? []) if (PRISM.test(imp.path)) findings.push(`${name}: ${input} imports ${imp.path}`);
      }
      for (const [output, info] of Object.entries(meta.outputs ?? {})) {
        for (const imp of info.imports ?? []) if (PRISM.test(imp.path)) findings.push(`${name}: ${output} imports ${imp.path}`);
      }
    }
  }
  return { findings, visited };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2);
  const built = args.includes("--built");
  const root = args.find((a) => !a.startsWith("--")) ?? fileURLToPath(new URL("..", import.meta.url));
  const { findings, visited } = checkNoPrism(root);
  console.log(`check-no-prism: visited manifest=${visited.manifest} sources=${visited.sources} metafiles=${visited.metafiles}`);
  for (const f of findings) console.log(`::error::Prism reference in a core chat package: ${f}`);
  if (!visited.manifest || visited.sources === 0 || (built && visited.metafiles === 0)) {
    console.log("::error::check-no-prism visited nothing; refusing to report clean.");
    process.exit(2);
  }
  process.exit(findings.length ? 1 : 0);
}
