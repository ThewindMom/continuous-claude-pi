import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import type { ContinuousClaudePiConfig } from "./config.js";
import { getHandoffBaseDir } from "./config.js";
import { nowStamp, slugify, textFromContentBlocks, trimTo } from "./utils.js";

interface SimpleMessage {
  role: string;
  toolName?: string;
  content?: unknown;
  details?: any;
  isError?: boolean;
}

function parseSessionFile(sessionFile: string): SimpleMessage[] {
  if (!existsSync(sessionFile)) return [];
  const messages: SimpleMessage[] = [];
  const lines = readFileSync(sessionFile, "utf8").split(/\r?\n/);
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const entry = JSON.parse(line) as any;
      if (entry.type === "message" && entry.message) {
        messages.push(entry.message as SimpleMessage);
      }
    } catch {
      // ignore malformed line
    }
  }
  return messages;
}

function summarizeMessages(messages: SimpleMessage[]): {
  lastUser: string;
  lastAssistant: string;
  filesModified: string[];
  errors: string[];
  toolCalls: string[];
} {
  let lastUser = "";
  let lastAssistant = "";
  const filesModified = new Set<string>();
  const errors: string[] = [];
  const toolCalls: string[] = [];

  for (const message of messages) {
    if (message.role === "user") {
      lastUser = typeof message.content === "string" ? message.content : textFromContentBlocks(message.content as any);
    }
    if (message.role === "assistant") {
      lastAssistant = typeof message.content === "string" ? message.content : textFromContentBlocks(message.content as any);
    }
    if (message.role === "toolResult") {
      if (message.toolName === "write" || message.toolName === "edit") {
        const path = message.details?.path ?? message.details?.filePath ?? message.details?.target;
        if (typeof path === "string" && path) filesModified.add(path);
      }
      if (message.toolName) toolCalls.push(message.toolName);
      if (message.isError) {
        const text = typeof message.content === "string" ? message.content : textFromContentBlocks(message.content as any);
        if (text) errors.push(trimTo(text, 300));
      }
    }
  }

  return {
    lastUser: trimTo(lastUser, 600),
    lastAssistant: trimTo(lastAssistant, 800),
    filesModified: Array.from(filesModified),
    errors: errors.slice(-5),
    toolCalls: toolCalls.slice(-10),
  };
}

export function findLatestHandoffFile(cwd: string, config: ContinuousClaudePiConfig): string | undefined {
  const base = getHandoffBaseDir(cwd, config);
  if (!existsSync(base)) return undefined;
  const sessionDirs = readdirSync(base, { withFileTypes: true }).filter((entry) => entry.isDirectory());
  const files: string[] = [];
  for (const sessionDir of sessionDirs) {
    const sessionPath = join(base, sessionDir.name);
    for (const entry of readdirSync(sessionPath, { withFileTypes: true })) {
      if (entry.isFile() && /\.ya?ml$/i.test(entry.name)) {
        files.push(join(sessionPath, entry.name));
      }
    }
  }
  return files.sort().at(-1);
}

export function readGoalNowFromHandoff(filePath: string | undefined): { goal?: string; now?: string } {
  if (!filePath || !existsSync(filePath)) return {};
  const content = readFileSync(filePath, "utf8");
  const goal = content.match(/^goal:\s*(.+)$/m)?.[1]?.trim().replace(/^['\"]|['\"]$/g, "");
  const now = content.match(/^now:\s*(.+)$/m)?.[1]?.trim().replace(/^['\"]|['\"]$/g, "");
  return { goal, now };
}

export function readNextSessionPromptFromHandoff(filePath: string | undefined): string | undefined {
  if (!filePath || !existsSync(filePath)) return undefined;
  const lines = readFileSync(filePath, "utf8").split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === "next_session_prompt: |");
  if (start === -1) return undefined;

  const block: string[] = [];
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    if (line.startsWith("  ")) {
      block.push(line.slice(2));
      continue;
    }
    if (!line.trim()) {
      block.push("");
      continue;
    }
    break;
  }

  const prompt = block.join("\n").trim();
  return prompt || undefined;
}

export function createHandoffFromSession(params: {
  cwd: string;
  config: ContinuousClaudePiConfig;
  sessionFile?: string;
  description?: string;
}): { path: string; content: string } {
  const { date, iso, fileTimestamp } = nowStamp();
  const sessionKey = params.sessionFile ? basename(params.sessionFile).replace(/\.jsonl$/, "") : "general";
  const description = slugify(params.description ?? "handoff");
  const handoffDir = join(getHandoffBaseDir(params.cwd, params.config), sessionKey);
  mkdirSync(handoffDir, { recursive: true });
  const handoffPath = join(handoffDir, `${fileTimestamp}_${description}.yaml`);

  const messages = params.sessionFile ? parseSessionFile(params.sessionFile) : [];
  const summary = summarizeMessages(messages);
  const goal = summary.lastUser || "Continue the current Continuous Claude Pi workflow";
  const now = summary.lastAssistant ? trimTo(summary.lastAssistant.split(/\r?\n/)[0] ?? "Continue from the latest completed step", 140) : "Continue from the latest completed step";

  const content = [
    "---",
    `session: ${sessionKey}`,
    `date: ${date}`,
    "status: partial",
    "outcome: PARTIAL_PLUS",
    "---",
    "",
    `goal: ${JSON.stringify(trimTo(goal, 140))}`,
    `now: ${JSON.stringify(now)}`,
    "test: \"Run project-specific verification commands\"",
    "",
    "mental_model: |",
    "  Continuous Claude Pi stores autonomous work under continuum/ and handoffs under thoughts/shared/handoffs by default.",
    "  TLDR is the analysis engine, Serena remains the best symbol-aware editor, and pi-fff remains the fastest fuzzy search layer.",
    "  Resume by reading this handoff, the most recent contract/report artifacts, and then continue with the next bounded worker step.",
    "",
    "codebase_state:",
    "  builds: false",
    "  tests_passing: \"unknown\"",
    "  test_command: \"TODO\"",
    "  pre_existing_failures: []",
    "  uncommitted_changes: true",
    "  branch: \"unknown\"",
    `  dirty_files: [${summary.filesModified.map((file) => JSON.stringify(file)).join(", ")}]`,
    `  warnings: ${summary.errors.length > 0 ? JSON.stringify(summary.errors.join(" | ")) : JSON.stringify("clean")}`,
    "",
    "done_this_session:",
    `  - task: ${JSON.stringify("Session activity summarized into handoff")}`,
    `    files: [${summary.filesModified.map((file) => JSON.stringify(file)).join(", ")}]`,
    "",
    "decisions: []",
    "findings:",
    "  critical: []",
    "  useful:",
    `    - ${JSON.stringify(`Recent tools: ${summary.toolCalls.join(", ") || "none"}`)}`,
    "  fyi: []",
    "worked: []",
    "failed: []",
    "trajectory:",
    `  started_as: ${JSON.stringify(summary.lastUser || "unknown")}`,
    `  evolved_to: ${JSON.stringify(now)}`,
    `  scoped_to: ${JSON.stringify("Continue current workflow")}`,
    "  user_approved_scope: true",
    "user_intent: |",
    `  ${summary.lastUser || "Continue the current workflow with preserved context."}`,
    "hypotheses:",
    "  - status: active",
    "    claim: \"The next session should continue from the most recent autonomous/research step.\"",
    `    evidence: [${JSON.stringify(summary.lastAssistant || "No assistant summary captured")}]`,
    "    next_test: \"Read the latest contract/report artifacts and verify current project state.\"",
    "blockers: []",
    `questions: [${summary.errors.map((error) => JSON.stringify(error)).join(", ")}]`,
    "next:",
    `  - ${JSON.stringify("Read the latest handoff plus related continuum artifacts before making edits.")}`,
    `  - ${JSON.stringify("Verify dependency status with /cc-check-deps and continue the next bounded workflow step.")}`,
    "next_session_prompt: |",
    `  Resume from handoff ${basename(handoffPath)}. Read the latest continuum artifacts, verify current state, and continue the next bounded Continuous Claude Pi workflow step.`,
    "files:",
    "  created: []",
    `  modified: [${summary.filesModified.map((file) => JSON.stringify(file)).join(", ")}]`,
    "",
    `# Generated at ${iso}`,
  ].join("\n");

  writeFileSync(handoffPath, content, "utf8");
  return { path: handoffPath, content };
}
