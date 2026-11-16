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
  ["turn forgets its message", "src/projection.ts", "messageId: origin ? origin.id : null });", "messageId: null });"],
  ["turn links an unknown message", "src/projection.ts", "messageId: origin ? origin.id : null });", "messageId: typeof data.messageId === \"string\" ? data.messageId : null });"],
  ["message never learns its turn", "src/projection.ts", "      if (origin && origin.turnId === null) origin.turnId = data.turnId;\n", ""],
  ["a later turn relinks the message", "src/projection.ts", "if (origin && origin.turnId === null) origin.turnId", "if (origin) origin.turnId"],
  ["one thinking block per run", "src/projection.ts", "latest && (latest.live || event.type === \"thinking.completed\") ? latest : undefined;", "latest;"],
  ["explicit thinking id ignored", "src/projection.ts", "const explicit = typeof data.thinkingId === \"string\" ? data.thinkingId : null;", "const explicit = null as string | null;"],
  ["non-string thinking id accepted", "src/projection.ts", "if (data.thinkingId !== undefined && typeof data.thinkingId !== \"string\") {", "if (false) {"],
  ["completed opens a block", "src/projection.ts", "        if (event.type === \"thinking.completed\") {\n          illegal();\n          break;\n        }\n        const thinkingId", "        const thinkingId"],
  ["duration always exact", "src/projection.ts", "tool.durationExact = data.durationExact !== false;", "tool.durationExact = true;"],
  ["any value makes it inexact", "src/projection.ts", "tool.durationExact = data.durationExact !== false;", "tool.durationExact = data.durationExact === true;"],
  ["check-install skips exports", "scripts/check-install.mjs", "  walk(manifest.exports);\n", ""],
  ["check-install passes on nothing", "scripts/check-install.mjs", "if (names.length === 0) {", "if (false) {"],
  ["check-install exits 0 on a broken package", "scripts/check-install.mjs", "  process.exit(1);\n}\nconsole.log(", "}\nconsole.log("],
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
  ["duplicates kept", "src/sequence.ts", "if (event.seq <= lastSeq) continue;", "if (event.seq < lastSeq) continue;"],
  ["gaps not held", "src/sequence.ts", "for (let next = held.get(lastSeq + 1); next; next = held.get(lastSeq + 1)) {", "for (const next of [...held.values()].sort((a, b) => a.seq - b.seq)) {"],
  ["reset keeps stale held events", "src/sequence.ts", "for (const seq of [...held.keys()]) if (seq <= lastSeq) held.delete(seq);", ";"],
  ["typed approval on by default", "src/typed-approval.ts", "{ enabled: false, locale: \"en\", phrases: {} }", "{ enabled: true, locale: \"en\", phrases: {} }"],
  ["typed approval ignores enabled", "src/typed-approval.ts", "if (!cfg.enabled || !approval || approval.state !== \"pending\") return null;", "if (!approval || approval.state !== \"pending\") return null;"],
  ["typed approval matches any state", "src/typed-approval.ts", "if (!cfg.enabled || !approval || approval.state !== \"pending\") return null;", "if (!cfg.enabled || !approval) return null;"],
  ["typing can grant always", "src/typed-approval.ts", "return options.find((o) => o.kind === once && optionTone(o.kind).decision === decision) ?? null;", "return options.find((o) => optionTone(o.kind).decision === decision) ?? null;"],
  ["a phrase inside a sentence matches", "src/typed-approval.ts", "normalizePhrase(p) === typed)) decision = \"approve\";", "typed.includes(normalizePhrase(p)))) decision = \"approve\";"],
  ["no NFKC fold", "src/typed-approval.ts", "text.normalize(\"NFKC\").toLowerCase()", "text.toLowerCase()"],
  ["trailing punctuation kept", "src/typed-approval.ts", "while (end > 0 && TRAILING_PUNCTUATION.has(s[end - 1] as string)) end -= 1;", ";"],
  ["undo open at the deadline", "src/undo.ts", "return { remainingMs, canRevert: remainingMs > 0 };", "return { remainingMs, canRevert: remainingMs >= 0 };"],
  ["undo accepts any deadline", "src/undo.ts", "isTimestamp(entry.deadline) ? Date.parse(entry.deadline) : Number.NaN", "Date.parse(entry.deadline)"],
  ["an agent reverts", "src/projection.ts", "event.type === \"undo.committed\" || decidedByActor(event, data.revertedBy)", "true"],
  ["undo closes twice", "src/projection.ts", "if (!entry || entry.state !== \"open\" || !allowed) {", "if (!entry || !allowed) {"],
  ["a null plan step is read", "src/plan.ts", "if (typeof step !== \"object\" || step === null || Array.isArray(step)) return { ok: false, error: \"plan.step\" };", ""],
  ["applyEvent throws on what it cannot read", "src/projection.ts", "  try {\n    return reduce(state, event);\n  } catch {\n    state.illegal += 1;\n    state.lastSeq = event.seq;\n    return true;\n  }\n", "  return reduce(state, event);\n"],
  ["held step released while pending", "src/plan.ts", "if (RELEASED_BY.has(approval.state)) continue;", "if (approval.state !== \"deciding\") continue;"],
  ["dropping a held step releases it", "src/plan.ts", "if (!after) return { ok: false, error: \"plan.held\" };", "if (!after) continue;"],
  ["approval id swap releases", "src/plan.ts", "const approval = before.approvalId ? approvals.find((a) => a.approvalId === before.approvalId) : undefined;", "const approval = after.approvalId ? approvals.find((a) => a.approvalId === after.approvalId) : undefined;"],
  ["rejected step may run", "src/plan.ts", "if (REFUSED_BY.has(approval.state) && (after.status === \"skipped\" || after.status === \"failed\")) continue;", "if (REFUSED_BY.has(approval.state)) continue;"],
  ["projection skips the plan guard", "src/projection.ts", "if (!checkPlanUpdate(plan?.steps ?? [], data.steps as PlanStep[], state.approvals).ok) {", "if (false) {"],
  ["branch rows not recorded", "src/projection.ts", "state.branches.push({ supersededId: supersedes, byId: m.id, rowIds: state.order.slice(targetAt + 1).map((o) => o.id) });", ";"],
  ["a decided message can still be delivered", "contract/machines.json", '{ "from": "queued", "action": "decide", "to": "decided" }', '{ "from": "queued", "action": "decide", "to": "decided" },\n      { "from": "decided", "action": "deliver", "to": "delivered" }'],
  ["decide from sending", "contract/machines.json", '{ "from": "sent", "action": "decide", "to": "decided" },', '{ "from": "sent", "action": "decide", "to": "decided" },\n      { "from": "sending", "action": "decide", "to": "decided" },'],
  ["branch cancels settled turns", "src/projection.ts", 'return state.turns.filter((t) => t.state !== "settled" && referenced.has(t.turnId)).map((t) => t.turnId);', "return state.turns.filter((t) => referenced.has(t.turnId)).map((t) => t.turnId);"],
  ["branch cancels every unsettled turn", "src/projection.ts", 'return state.turns.filter((t) => t.state !== "settled" && referenced.has(t.turnId)).map((t) => t.turnId);', 'return state.turns.filter((t) => t.state !== "settled").map((t) => t.turnId);'],
  ["branch ignores approvals", "src/projection.ts", 'for (const a of state.approvals) if (ids.has(a.approvalId) && typeof a.turnId === "string") referenced.add(a.turnId);', ";"],
  ["branch skips the superseded message", "src/projection.ts", "const ids = new Set([supersededId, ...branch.rowIds]);", "const ids = new Set([...branch.rowIds]);"],
  ["tool output dropped", "src/projection.ts", 'tool.output = typeof data.output === "string" ? data.output : null;', "tool.output = null;"],
  ["tool output not checked for text", "src/projection.ts", 'tool.output = typeof data.output === "string" ? data.output : null;', "tool.output = (data.output as string) ?? null;"],
  ["tool output language dropped", "src/projection.ts", 'tool.outputLanguage = typeof data.outputLanguage === "string" ? data.outputLanguage : null;', "tool.outputLanguage = null;"],
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
