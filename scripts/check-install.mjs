#!/usr/bin/env node
// fancy-chat-check-install: run from the host's project root (npx fancy-chat-check-install).
//
// A package installed from git builds its dist in `prepare`. With ignore-scripts=true
// npm skips `prepare` (and every postinstall, so no install hook can warn), and the
// package arrives with no dist: a bundler later reports only an unresolvable entry.
// This script is committed source, so it runs without any build. It checks every
// installed @particle-academy package's main, module and exports targets, names each
// missing file, and exits 1. Finding no packages is a failure too, never a pass.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(process.cwd(), "node_modules", "@particle-academy");

function targets(manifest) {
  const out = new Set();
  for (const key of ["main", "module"]) if (typeof manifest[key] === "string") out.add(manifest[key]);
  const walk = (v) => {
    if (typeof v === "string") {
      if (/\.(c|m)?js$/.test(v)) out.add(v);
    } else if (v && typeof v === "object") for (const x of Object.values(v)) walk(x);
  };
  walk(manifest.exports);
  return [...out];
}

const names = existsSync(root) ? readdirSync(root).filter((n) => existsSync(join(root, n, "package.json"))) : [];
if (names.length === 0) {
  console.error(`fancy-chat-check-install: no @particle-academy packages under ${root}. Run it from the project root, after installing.`);
  process.exit(1);
}

const broken = [];
for (const name of names) {
  const dir = join(root, name);
  const manifest = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
  const missing = targets(manifest).filter((t) => !existsSync(join(dir, t)));
  if (missing.length) broken.push({ name, missing });
}

if (broken.length) {
  for (const b of broken) console.error(`@particle-academy/${b.name}: missing ${b.missing.join(", ")}`);
  console.error(
    [
      "",
      `${broken.length} package(s) have no build. A git install builds dist in \`prepare\`, which npm skips under ignore-scripts=true.`,
      "Fix: reinstall with scripts allowed (npm install --ignore-scripts=false), or run `npm run build` inside each package listed above,",
      "in dependency order (react-fancy, fancy-chat-js, fancy-chat-ui).",
    ].join("\n"),
  );
  process.exit(1);
}
console.log(`fancy-chat-check-install: ${names.length} @particle-academy packages, every entry file present.`);
