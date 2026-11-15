// Break one clause at a time; the suite must notice every one. A suite written
// alongside its implementation passes on its first run, and a check never seen
// to fail cannot be told apart from one that cannot. Each file is restored in a
// `finally`. Exits 1 if a mutation survives, 2 if a pattern is no longer in the
// file (a sweep that cannot find what it breaks is not sweeping).
//
//   node tests/sabotage.mjs
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const file = (name) => fileURLToPath(new URL(`../${name}`, import.meta.url));

const MUTATIONS = [
  ["unknown major accepted", "src/events.ts", "if (e.v !== 1) return", "if (e.v === 99) return"],
  ["seq zero accepted", "src/events.ts", "e.seq < 1)", "e.seq < 0)"],
  ["extension namespace optional", "src/events.ts", "/^x-[a-z0-9][a-z0-9-]*\\.[a-z0-9][a-z0-9._-]*$/", "/^x-[a-z0-9.-]+$/"],
  ["run ids unchecked", "src/events.ts", 'return { ok: false, error: `event.${key}` };', ";"],
  ["turn settles from pending", "contract/machines.json", '{ "from": "running", "action": "finish", "to": "settled", "outcome": "completed" },', '{ "from": "running", "action": "finish", "to": "settled", "outcome": "completed" },\n      { "from": "pending", "action": "finish", "to": "settled", "outcome": "completed" },'],
  ["unsend after delivery", "contract/machines.json", '{ "from": "queued", "action": "unsend", "to": "unsent" }', '{ "from": "queued", "action": "unsend", "to": "unsent" },\n      { "from": "delivered", "action": "unsend", "to": "unsent" }'],
  ["approve without deciding", "contract/machines.json", '{ "from": "deciding", "action": "approve", "to": "approved" },', '{ "from": "deciding", "action": "approve", "to": "approved" },\n      { "from": "pending", "action": "approve", "to": "approved" },'],
  ["tone from the label", "src/machines.ts", "const hit = Object.prototype.hasOwnProperty.call(kinds, kind) ? kinds[kind] : undefined;", 'const hit = kind.startsWith("approve") ? { tone: "positive" as OptionTone, decision: "approve" as Decision } : Object.prototype.hasOwnProperty.call(kinds, kind) ? kinds[kind] : undefined;'],
  ["an agent may decide", "src/hitl.ts", 'actor.kind === "human" && typeof actor.id', 'actor.kind !== "system" && typeof actor.id'],
  ["empty human id decides", "src/hitl.ts", 'typeof actor.id === "string" && actor.id !== ""', 'typeof actor.id === "string"'],
  ["reserved names case-sensitive", "src/hitl.ts", "const lower = name.toLowerCase();", "const lower = name;"],
  ["blank note counts", "src/hitl.ts", 'typeof note === "string" && note.trim() !== ""', 'typeof note === "string"'],
  ["notes ignore allowNote", "src/hitl.ts", "if (question.allowNote && typeof note", "if (typeof note"],
  ["unoffered option accepted", "src/hitl.ts", 'if (chosen.some((v) => !offered.has(v))) return { ok: false, error: "question.option" };', ";"],
  ["in-flight lock ignored", "src/hitl.ts", "if (scoped.some((i) => IN_FLIGHT[i.kind] === i.state)) return null;", ";"],
  ["newest actionable wins", "src/hitl.ts", "item.seq < best.seq", "item.seq > best.seq"],
  ["raw echarts from agents", "src/parts.ts", 'if (ctx.origin !== "server") return fail("part.chart.raw");', ";"],
  ["agents place approvals", "src/parts.ts", 'if (ctx.origin !== "server") return fail("part.hitl.origin");', ";"],
  ["javascript links in cards", "src/parts.ts", "!/^https?:\\/\\//i.test(a.href)", "a.href === \"\""],
  ["no depth cap", "src/parts.ts", 'if (depth > limits.maxDepth) return fail("part.depth");', ";"],
  ["size cap off by one", "src/parts.ts", "jsonBytes(p) > limits.maxPartBytes", "jsonBytes(p) > limits.maxPartBytes + 1"],
  ["unknown core kinds pass", "src/parts.ts", 'if (!EXTENSION_KIND.test(p.kind)) return fail("part.kind");', ";"],
  ["broken does not win", "src/status.ts", 'if (typeof snapshot.broken === "string" && snapshot.broken !== "") return out("broken", { reason: snapshot.broken }, null);', ";"],
  ["cooling inclusive", "src/status.ts", "if (idleFor < cfg.coolingMs)", "if (idleFor <= cfg.coolingMs)"],
  ["pending hitl never parks", "src/status.ts", '(turn && turn.state === "awaiting-human") || pending > 0', 'turn && turn.state === "awaiting-human"'],
  ["replays re-applied", "src/projection.ts", "if (event.seq <= state.lastSeq) return false;", "if (event.seq < state.lastSeq) return false;"],
  ["a transition may settle", "src/projection.ts", 'if (!turn || settling !== (event.type === "turn.settled")) {', "if (!turn) {"],
  ["agent decisions recorded", "src/projection.ts", "if (!record || !decidedByActor(event, data.decidedBy) || typeof data.decision", "if (!record || typeof data.decision"],
  ["agent answers recorded", "src/projection.ts", 'if (!q || q.state !== "open" || !decidedByActor(event, data.answeredBy)) {', 'if (!q || q.state !== "open") {'],
  ["decider need not be the actor", "src/projection.ts", "claimed.kind === event.actor.kind && claimed.id === event.actor.id", "true"],
  ["actor need not be human", "src/projection.ts", "return canDecide(event.actor) && isPlainObject(claimed)", "return isPlainObject(claimed)"],
  ["supersede not marked", "src/projection.ts", "if (target) target.superseded = true;", ";"],
  ["text deltas replace", "src/projection.ts", 'current.text = String(current.text ?? "") + data.text;', "current.text = data.text;"],
  ["thinking not merged per run", "src/projection.ts", "let entry = byId(state.thinking, \"runId\", runId);", "let entry: ThinkingEntry | undefined = undefined;"],
  ["duplicates kept", "src/sequence.ts", "if (event.seq <= lastSeq) continue;", "if (event.seq < lastSeq) continue;"],
  ["gaps not held", "src/sequence.ts", "for (let next = held.get(lastSeq + 1); next; next = held.get(lastSeq + 1)) {", "for (const next of [...held.values()].sort((a, b) => a.seq - b.seq)) {"],
  ["reset keeps stale held events", "src/sequence.ts", "for (const seq of [...held.keys()]) if (seq <= lastSeq) held.delete(seq);", ";"],
  ["packaging check misses source imports", "scripts/check-no-prism.mjs", "if (spec && PRISM.test(spec)) findings.push", "if (false) findings.push"],
  ["packaging check misses the manifest", "scripts/check-no-prism.mjs", "for (const name of names) if (PRISM.test(name))", "for (const name of names) if (false)"],
];

function runSuite() {
  const r = spawnSync("npx", ["vitest", "run", "--reporter=dot"], {
    cwd: root,
    shell: true,
    encoding: "utf8",
    env: { ...process.env, FANCY_CHAT_SABOTAGE: "1" },
  });
  return r.status;
}

let survived = 0;
let missing = 0;
for (const [name, rel, search, replace] of MUTATIONS) {
  const path = file(rel);
  const original = readFileSync(path, "utf8");
  if (!original.includes(search)) {
    console.log(`MISSING  ${name}: pattern not found in ${rel}`);
    missing += 1;
    continue;
  }
  try {
    writeFileSync(path, original.replace(search, replace));
    const status = runSuite();
    if (status === 0) {
      console.log(`SURVIVED ${name}`);
      survived += 1;
    } else {
      console.log(`caught   ${name}`);
    }
  } finally {
    writeFileSync(path, original);
  }
}
console.log(`sabotage: ${MUTATIONS.length} mutations, ${MUTATIONS.length - survived - missing} caught, ${survived} survived, ${missing} missing`);
process.exit(missing ? 2 : survived ? 1 : 0);
