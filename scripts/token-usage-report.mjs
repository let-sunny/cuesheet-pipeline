#!/usr/bin/env node
/**
 * pnpm token-usage [--session <id>] [--since <YYYY-MM-DD>] [--json] [--dir <logDir>]
 *
 * Measures Claude Code token usage for this project by parsing the local
 * session log JSONL files Claude Code already keeps on disk under
 * ~/.claude/projects/<encoded-repo-path>/ -- no network calls, no new deps.
 *
 * What gets read:
 *   - Top-level session transcripts: <logDir>/<sessionId>.jsonl
 *   - Every subagent transcript nested under <logDir>/<sessionId>/, matched
 *     recursively (any depth) as agent-*.jsonl (this also picks up
 *     background Workflow forks nested under
 *     .../subagents/workflows/wf_.../agent-*.jsonl, not just
 *     directly-launched Task/Agent-tool subagents).
 *   - The sibling agent-*.meta.json next to each subagent transcript, which
 *     carries agentType/description/spawnDepth when available.
 *
 * Known quirks of this log format that this script accounts for (see
 * docs/token-usage.md for the full writeup):
 *   1. A single logical assistant message (one message.id) is split across
 *      multiple JSONL lines -- one per content block (thinking/tool_use/
 *      text) -- and EACH line repeats the same usage snapshot for that
 *      message. Summing every line would double- or triple-count tokens.
 *      Fix: dedupe by message.id per file, count usage once per id.
 *   2. Some entries (seen on backgrounded/"bg" sessions) report all-zero
 *      top-level usage.input_tokens/output_tokens/cache_*_tokens and stash
 *      the real numbers in usage.iterations[] instead. Fix: prefer
 *      iterations when present, sum across them.
 *   3. Per-subagent token usage is generally NOT recoverable from a task
 *      launch notification alone (those only carry a resolvedModel/
 *      description, no usage) -- it only exists in the subagent's own
 *      agent-*.jsonl transcript. If the harness ever fails to persist that
 *      file (e.g. it only lived in a transient /private/tmp path), that
 *      agent's usage is invisible to this script and only shows up folded
 *      into whatever totals your provider dashboard reports.
 *
 * Workflow tagging is a heuristic (string/tool-name matching), not ground
 * truth -- unmatched runs are honestly labeled "unclassified" rather than
 * guessed into a bucket.
 */

import { createReadStream, existsSync, readFileSync, readdirSync } from "node:fs";
import { createInterface } from "node:readline";
import { homedir } from "node:os";
import { basename, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");

// USD per 1,000,000 tokens. Anthropic's published API list prices as of this
// writing -- PRICES MAY BE STALE, check https://www.anthropic.com/pricing
// before using this for real billing/budget decisions.
const PRICE_PER_MILLION = {
  haiku: { input: 1, output: 5, cacheWrite: 1.25, cacheRead: 0.1 },
  sonnet: { input: 3, output: 15, cacheWrite: 3.75, cacheRead: 0.3 },
  opus: { input: 15, output: 75, cacheWrite: 18.75, cacheRead: 1.5 },
};

const WORKFLOW_RULES = [
  { tag: "episode-draft-pipeline", re: /\/episode\b|초벌|scanFolder|assembleDraft|manifest\.json/i },
  { tag: "vision-judgment", re: /vision|비전\s*판단|moments\.json|quality\s*>=/i },
  { tag: "bridge-edit", toolPrefix: "mcp__cuesheet-bridge__" },
  { tag: "goal-orchestration", re: /\/goal\b|docs\/goals/i },
  { tag: "render-e2e", re: /buildRenderPlan|cuesheet-render\b|ffmpeg/i },
];

function parseArgs(argv) {
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith("--")) {
      flags[key] = next;
      i++;
    } else {
      flags[key] = true;
    }
  }
  return flags;
}

function emptyTotals() {
  return { input: 0, output: 0, cacheWrite: 0, cacheRead: 0, messages: 0 };
}

function addTotals(dst, src) {
  dst.input += src.input;
  dst.output += src.output;
  dst.cacheWrite += src.cacheWrite;
  dst.cacheRead += src.cacheRead;
  dst.messages += src.messages;
}

function extractUsage(usage) {
  if (!usage) return { input: 0, output: 0, cacheWrite: 0, cacheRead: 0, messages: 1 };
  if (Array.isArray(usage.iterations) && usage.iterations.length > 0) {
    let input = 0;
    let output = 0;
    let cacheWrite = 0;
    let cacheRead = 0;
    for (const it of usage.iterations) {
      input += it.input_tokens || 0;
      output += it.output_tokens || 0;
      cacheWrite += it.cache_creation_input_tokens || 0;
      cacheRead += it.cache_read_input_tokens || 0;
    }
    return { input, output, cacheWrite, cacheRead, messages: 1 };
  }
  return {
    input: usage.input_tokens || 0,
    output: usage.output_tokens || 0,
    cacheWrite: usage.cache_creation_input_tokens || 0,
    cacheRead: usage.cache_read_input_tokens || 0,
    messages: 1,
  };
}

function tierOf(model) {
  const m = (model || "").toLowerCase();
  if (m === "<synthetic>" || m === "synthetic") return "synthetic";
  if (m.includes("haiku")) return "haiku";
  if (m.includes("opus")) return "opus";
  if (m.includes("sonnet")) return "sonnet";
  // claude-fable-5 has no published/known price in this dataset; treat as
  // Opus-tier placeholder so a cost estimate still shows up, clearly noted.
  if (m.includes("fable")) return "opus";
  return null;
}

function costOf(totals, model) {
  const tier = tierOf(model);
  if (tier === "synthetic") return 0;
  if (!tier) return null;
  const p = PRICE_PER_MILLION[tier];
  return (
    (totals.input * p.input +
      totals.output * p.output +
      totals.cacheWrite * p.cacheWrite +
      totals.cacheRead * p.cacheRead) /
    1e6
  );
}

function classify(text, toolNames) {
  const tags = new Set();
  for (const rule of WORKFLOW_RULES) {
    if (rule.re && rule.re.test(text)) tags.add(rule.tag);
    if (rule.toolPrefix && toolNames.some((n) => typeof n === "string" && n.startsWith(rule.toolPrefix))) {
      tags.add(rule.tag);
    }
  }
  if (tags.size === 0) tags.add("unclassified");
  return [...tags];
}

function mergeModelMap(target, source) {
  for (const [model, totals] of source) {
    if (!target.has(model)) target.set(model, emptyTotals());
    addTotals(target.get(model), totals);
  }
}

function mapToSortedArray(map) {
  return [...map.entries()]
    .map(([model, totals]) => ({ model, totals, cost: costOf(totals, model) }))
    .sort((a, b) => b.totals.input + b.totals.output - (a.totals.input + a.totals.output));
}

/** Streams one JSONL transcript file, deduping repeated per-block usage lines by message.id. */
async function analyzeTranscript(filePath, sinceDate) {
  const seenMsgIds = new Set();
  const byModel = new Map();
  const totals = emptyTotals();
  const toolNames = new Set();
  const promptTextParts = [];
  let malformed = 0;

  const rl = createInterface({ input: createReadStream(filePath, "utf8"), crlfDelay: Infinity });
  for await (const raw of rl) {
    const line = raw.trim();
    if (!line) continue;
    let obj;
    try {
      obj = JSON.parse(line);
    } catch {
      malformed++;
      continue;
    }

    if (sinceDate && obj.timestamp) {
      const t = new Date(obj.timestamp);
      if (!Number.isNaN(t.getTime()) && t < sinceDate) continue;
    }

    if (obj.type === "user") {
      const content = obj.message?.content;
      if (typeof content === "string" && promptTextParts.length < 20) {
        promptTextParts.push(content);
      }
      continue;
    }

    if (obj.type !== "assistant") continue;

    const msg = obj.message || {};
    const model = msg.model || "unknown";
    const content = Array.isArray(msg.content) ? msg.content : [];
    for (const block of content) {
      if (block?.type === "tool_use" && block.name) toolNames.add(block.name);
    }

    const msgId = msg.id;
    if (msgId) {
      if (seenMsgIds.has(msgId)) continue; // same message, different content-block line -> usage already counted
      seenMsgIds.add(msgId);
    }

    const usage = extractUsage(msg.usage);
    if (!byModel.has(model)) byModel.set(model, emptyTotals());
    addTotals(byModel.get(model), usage);
    addTotals(totals, usage);
  }

  return {
    byModel,
    totals,
    promptText: promptTextParts.join("\n").slice(0, 4000),
    toolNames,
    malformed,
  };
}

function walkAgentFiles(dir) {
  const out = [];
  const stack = [dir];
  while (stack.length) {
    const cur = stack.pop();
    let entries;
    try {
      entries = readdirSync(cur, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = join(cur, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (entry.isFile() && entry.name.startsWith("agent-") && entry.name.endsWith(".jsonl")) {
        out.push(full);
      }
    }
  }
  return out;
}

function fmt(n) {
  return Math.round(n).toLocaleString("en-US");
}

function fmtCost(n) {
  if (n === null || n === undefined) return "n/a";
  return `$${n.toFixed(4)}`;
}

function printTable(headers, rows) {
  const widths = headers.map((h, i) => Math.max(h.length, ...rows.map((r) => String(r[i]).length)));
  const line = (cells) => cells.map((c, i) => String(c).padStart(widths[i])).join("  ");
  console.log(headers.map((h, i) => h.padEnd(widths[i])).join("  ").trimEnd());
  console.log(widths.map((w) => "-".repeat(w)).join("  "));
  for (const r of rows) console.log(line(r));
}

async function main() {
  const flags = parseArgs(process.argv.slice(2));
  const logDir = flags.dir || join(homedir(), ".claude", "projects", repoRoot.replace(/\//g, "-"));

  if (!existsSync(logDir)) {
    console.error(`Log directory not found: ${logDir}`);
    process.exit(1);
  }

  let sinceDate = null;
  if (typeof flags.since === "string") {
    sinceDate = new Date(flags.since);
    if (Number.isNaN(sinceDate.getTime())) {
      console.error(`--since: could not parse date "${flags.since}"`);
      process.exit(1);
    }
  }

  const allTopFiles = readdirSync(logDir, { withFileTypes: true })
    .filter((d) => d.isFile() && d.name.endsWith(".jsonl"))
    .map((d) => d.name);
  const allSessionIds = allTopFiles.map((f) => f.slice(0, -".jsonl".length));

  let targetSessionIds = allSessionIds;
  if (typeof flags.session === "string") {
    targetSessionIds = allSessionIds.filter((id) => id === flags.session);
    if (targetSessionIds.length === 0) {
      console.error(`--session: no session log found for "${flags.session}" in ${logDir}`);
      process.exit(1);
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    logDir,
    filters: { session: typeof flags.session === "string" ? flags.session : null, since: flags.since || null },
    malformedLines: 0,
    sessionCount: 0,
    agentCount: 0,
    sessions: [],
    agents: [],
    totals: emptyTotals(),
    byModel: new Map(),
    byWorkflow: new Map(),
  };

  const bumpWorkflow = (tags, totals) => {
    for (const tag of tags) {
      if (!report.byWorkflow.has(tag)) report.byWorkflow.set(tag, emptyTotals());
      addTotals(report.byWorkflow.get(tag), totals);
    }
  };

  for (const sessionId of targetSessionIds) {
    const topFile = join(logDir, `${sessionId}.jsonl`);
    const session = await analyzeTranscript(topFile, sinceDate);
    report.malformedLines += session.malformed;
    mergeModelMap(report.byModel, session.byModel);
    addTotals(report.totals, session.totals);
    const sessionTags = classify(session.promptText, [...session.toolNames]);
    bumpWorkflow(sessionTags, session.totals);
    report.sessionCount++;
    report.sessions.push({
      sessionId,
      totals: session.totals,
      byModel: Object.fromEntries(session.byModel),
      workflowTags: sessionTags,
    });

    const sessionDir = join(logDir, sessionId);
    if (!existsSync(sessionDir)) continue;
    const agentFiles = walkAgentFiles(sessionDir);
    for (const agentFile of agentFiles) {
      const metaFile = agentFile.replace(/\.jsonl$/, ".meta.json");
      let meta = {};
      if (existsSync(metaFile)) {
        try {
          meta = JSON.parse(readFileSync(metaFile, "utf8"));
        } catch {
          // malformed meta file: proceed with empty meta, still count usage from the transcript
        }
      }
      const agentId = basename(agentFile).replace(/^agent-/, "").replace(/\.jsonl$/, "");
      const agent = await analyzeTranscript(agentFile, sinceDate);
      report.malformedLines += agent.malformed;
      mergeModelMap(report.byModel, agent.byModel);
      addTotals(report.totals, agent.totals);
      const classifyText = `${meta.description || ""}\n${agent.promptText}`;
      const agentTags = classify(classifyText, [...agent.toolNames]);
      bumpWorkflow(agentTags, agent.totals);
      report.agentCount++;
      report.agents.push({
        sessionId,
        agentId,
        agentType: meta.agentType || "unknown",
        description: meta.description || null,
        spawnDepth: meta.spawnDepth ?? null,
        isWorkflowFork: agentFile.split(sep).includes("workflows"),
        totals: agent.totals,
        byModel: Object.fromEntries(agent.byModel),
        workflowTags: agentTags,
      });
    }
  }

  if (flags.json) {
    const out = {
      ...report,
      byModel: Object.fromEntries(report.byModel),
      byWorkflow: Object.fromEntries(report.byWorkflow),
    };
    console.log(JSON.stringify(out, null, 2));
    return;
  }

  render(report);
}

function render(report) {
  console.log(`Token usage report -- ${report.generatedAt}`);
  console.log(`Log dir: ${report.logDir}`);
  if (report.filters.session) console.log(`Filter: session=${report.filters.session}`);
  if (report.filters.since) console.log(`Filter: since=${report.filters.since}`);
  console.log(
    `Sessions: ${report.sessionCount}  Agent transcripts: ${report.agentCount}  Malformed lines skipped: ${report.malformedLines}`
  );
  console.log();

  const modelRows = mapToSortedArray(report.byModel);
  console.log("By model (all sessions + all subagent/workflow-fork transcripts combined):");
  printTable(
    ["Model", "Msgs", "Input", "Output", "CacheWrite", "CacheRead", "Est. cost"],
    modelRows.map((r) => [
      r.model,
      fmt(r.totals.messages),
      fmt(r.totals.input),
      fmt(r.totals.output),
      fmt(r.totals.cacheWrite),
      fmt(r.totals.cacheRead),
      fmtCost(r.cost),
    ])
  );
  console.log();

  const workflowRows = [...report.byWorkflow.entries()]
    .map(([tag, totals]) => ({ tag, totals }))
    .sort((a, b) => b.totals.input + b.totals.output - (a.totals.input + a.totals.output));
  console.log("By workflow tag (heuristic; a run can match more than one tag, so this can double-count vs. the model table):");
  printTable(
    ["Tag", "Msgs", "Input", "Output", "CacheWrite", "CacheRead"],
    workflowRows.map((r) => [tag(r), fmt(r.totals.messages), fmt(r.totals.input), fmt(r.totals.output), fmt(r.totals.cacheWrite), fmt(r.totals.cacheRead)])
  );
  console.log();

  function tag(r) {
    return r.tag;
  }

  const totalCost = modelRows.reduce((sum, r) => (r.cost === null ? sum : sum + r.cost), 0);
  const unpriced = modelRows.filter((r) => r.cost === null).map((r) => r.model);
  console.log("Grand totals:");
  console.log(
    `  input=${fmt(report.totals.input)}  output=${fmt(report.totals.output)}  cacheWrite=${fmt(
      report.totals.cacheWrite
    )}  cacheRead=${fmt(report.totals.cacheRead)}  messages=${fmt(report.totals.messages)}`
  );
  console.log(`  estimated cost: ~$${totalCost.toFixed(2)} (prices may be stale; see script header)`);
  if (unpriced.length) console.log(`  no price mapping for: ${unpriced.join(", ")} (excluded from cost total)`);

  const topAgents = [...report.agents]
    .sort((a, b) => b.totals.input + b.totals.output - (a.totals.input + a.totals.output))
    .slice(0, 10);
  if (topAgents.length) {
    console.log();
    console.log("Top 10 agent transcripts by tokens:");
    printTable(
      ["AgentType", "Tokens(in+out)", "Description", "Tags"],
      topAgents.map((a) => [
        a.agentType,
        fmt(a.totals.input + a.totals.output),
        (a.description || (a.isWorkflowFork ? "(workflow fork, no description)" : "(no description)")).slice(0, 50),
        a.workflowTags.join("+"),
      ])
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
