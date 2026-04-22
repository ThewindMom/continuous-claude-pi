import { existsSync, readFileSync, readdirSync, statSync, copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { getAgentDir } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { DEFAULT_CONFIG, getAutoRolloverGuardPath, getProjectConfigPath, loadConfig } from "./config.js";
import { checkDependencies, formatDependencyStatus } from "./deps.js";
import { createHandoffFromSession, findLatestHandoffFile, readGoalNowFromHandoff, readNextSessionPromptFromHandoff } from "./handoff.js";
import { migrateRustDexSettings } from "./migration.js";
import { buildNavMapForFile, runTldr, tldrSchema } from "./tldr.js";
import { commandExists, readJsonFile, resolveMaybeRelative, runCommand, textFromContentBlocks, trimTo, tryParseJson, writeJsonFile, slugify } from "./utils.js";

const CODE_EXTENSIONS = new Set([
  ".py", ".ts", ".tsx", ".js", ".jsx", ".mjs", ".go", ".rs", ".java", ".kt", ".c", ".cpp", ".cc", ".h", ".hpp", ".rb", ".php", ".swift", ".cs", ".scala", ".ex", ".exs", ".lua",
]);

const TEST_PATTERNS = [/test_.*\.py$/, /.*_test\.py$/, /.*\.test\.[tj]sx?$/, /.*\.spec\.[tj]sx?$/, /.*_test\.go$/, /.*_test\.rs$/];
const EDIT_EXTENSIONS = new Set([".py", ".ts", ".tsx", ".js", ".jsx", ".mjs", ".rs"]);
const CC_COMMAND_PREFIXES = [
  "/cc-check-deps",
  "/cc-status",
  "/cc-migrate-rustdex",
  "/cc-setup",
  "/cc-create-handoff",
  "/cc-install-agents",
  "/cc-rollover",
] as const;

function isCodeFile(filePath: string): boolean {
  return CODE_EXTENSIONS.has(extname(filePath));
}

function shouldBypassRead(filePath: string, input: Record<string, unknown>, smallFileBytes: number): boolean {
  if (!filePath || !isCodeFile(filePath)) return true;
  if (TEST_PATTERNS.some((pattern) => pattern.test(filePath))) return true;
  if (filePath.includes(`${join(".claude", "hooks")}`) || filePath.includes(`${join(".claude", "skills")}`)) return true;
  if (input.offset !== undefined || input.limit !== undefined) return true;
  try {
    return statSync(filePath).size < smallFileBytes;
  } catch {
    return true;
  }
}

function registerGenericCliTool(pi: ExtensionAPI, options: { name: string; binary: string; description: string; note?: string }) {
  pi.registerTool({
    name: options.name,
    label: options.name,
    description: `${options.description}${options.note ? ` ${options.note}` : ""}`,
    parameters: Type.Object({
      args: Type.Array(Type.String(), { description: `Arguments passed to ${options.binary}` }),
      cwd: Type.Optional(Type.String({ description: "Optional working directory" })),
      stdin: Type.Optional(Type.String({ description: "Optional stdin payload" })),
    }),
    async execute(_toolCallId, params: any) {
      if (!commandExists(options.binary)) {
        throw new Error(`${options.binary} is not installed`);
      }
      const result = runCommand(options.binary, params.args ?? [], {
        cwd: params.cwd || process.cwd(),
        input: params.stdin,
        timeoutMs: 120_000,
      });
      const text = (result.stdout || result.stderr || result.error || "").trim();
      if (!result.ok) {
        throw new Error(text || `${options.binary} failed`);
      }
      return {
        content: [{ type: "text", text: text || `${options.binary} completed successfully.` }],
        details: tryParseJson(text) ?? { command: options.binary, args: params.args ?? [] },
      };
    },
  });
}

const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CC_ROLLOVER_GLOBAL_KEY = Symbol.for("continuous-claude-pi-rollover-pending");

type PendingGlobalRollover = { prompt: string } | null;

function getPendingRolloverGlobal(): PendingGlobalRollover {
  return (globalThis as Record<PropertyKey, unknown>)[CC_ROLLOVER_GLOBAL_KEY] as PendingGlobalRollover ?? null;
}

function setPendingRolloverGlobal(data: PendingGlobalRollover) {
  if (data) {
    (globalThis as Record<PropertyKey, unknown>)[CC_ROLLOVER_GLOBAL_KEY] = data;
  } else {
    delete (globalThis as Record<PropertyKey, unknown>)[CC_ROLLOVER_GLOBAL_KEY];
  }
}

export default function continuousClaudePiExtension(pi: ExtensionAPI) {
  let activeCwd = process.cwd();
  let dependencyStatus = checkDependencies();
  let configInfo = loadConfig(activeCwd);
  const processedDiagnosticsToolCalls = new Set<string>();
  const autoRolledOverSessions = new Set<string>();
  let pendingAutoRollover: { prompt: string; parentSession: string | undefined; handoffPath: string } | null = null;
  let rolloverTimestamp: number | null = null;

  function refreshState(cwd: string) {
    activeCwd = cwd;
    dependencyStatus = checkDependencies();
    configInfo = loadConfig(cwd);
  }

  function loadRolloverGuard(): { expiresAt?: number } | null {
    return readJsonFile<{ expiresAt?: number } | null>(getAutoRolloverGuardPath(), null);
  }

  function saveRolloverGuard(data: { expiresAt: number } | null): void {
    writeJsonFile(getAutoRolloverGuardPath(), data);
  }

  function buildResumePrompt(handoffPath: string): string {
    const prompt = readNextSessionPromptFromHandoff(handoffPath);
    return prompt ?? `Resume from handoff ${handoffPath}. Read it first, then continue autonomously from the next bounded step.`;
  }

  function buildRolloverPrompt(handoffPath: string): string {
    return `${buildResumePrompt(handoffPath)}\n\nHandoff path: ${handoffPath}`;
  }

  function shouldAutoRollover(sessionFile: string | undefined, tokens: number | undefined): sessionFile is string {
    if (!sessionFile || !configInfo.config.autoRollover.enabled) return false;
    if (autoRolledOverSessions.has(sessionFile)) return false;
    if ((loadRolloverGuard()?.expiresAt ?? 0) > Date.now()) return false;
    if (tokens === undefined || tokens < configInfo.config.autoRollover.thresholdTokens) return false;
    return true;
  }

  function prepareAutoRollover(sessionFile: string, description = "auto-rollover") {
    const handoff = createHandoffFromSession({
      cwd: activeCwd,
      config: configInfo.config,
      sessionFile,
      description,
    });
    autoRolledOverSessions.add(sessionFile);
    saveRolloverGuard({ expiresAt: Date.now() + configInfo.config.autoRollover.cooldownMs });
    return handoff;
  }

  function setFooterStatus(ctx: { ui?: { setStatus?: (key: string, value?: string) => void } }) {
    const requiredOkay = dependencyStatus.missingRequired.length === 0;
    const statusText = requiredOkay
      ? `CC✓ tl:${dependencyStatus.checks.find((c) => c.name === "tldr")?.available ? "on" : "off"} ou:${dependencyStatus.checks.find((c) => c.name === "ouros")?.available ? "on" : "off"} fe:${dependencyStatus.checks.find((c) => c.name === "fastedit")?.available ? "on" : "off"}`
      : `CC! missing:${dependencyStatus.missingRequired.join(",")}`;
    ctx.ui?.setStatus?.("continuous-claude-pi", statusText);

    const continuity = readGoalNowFromHandoff(findLatestHandoffFile(activeCwd, configInfo.config));
    const flowText = continuity.goal && continuity.now
      ? `${trimTo(continuity.goal, 28)} -> ${trimTo(continuity.now, 28)}`
      : continuity.now || continuity.goal;
    ctx.ui?.setStatus?.("continuous-claude-pi-flow", flowText || undefined);
  }

  pi.on("session_start", async (event, ctx) => {
    refreshState(ctx.cwd);
    rolloverTimestamp = null;
    setFooterStatus(ctx);
    if (dependencyStatus.missingRequired.length > 0) {
      ctx.ui.notify(`continuous-claude-pi missing required dependencies: ${dependencyStatus.missingRequired.join(", ")}`, "warning");
    }
    for (const warning of dependencyStatus.warnings) {
      ctx.ui.notify(warning, "warning");
    }

    if (event.reason === "new") {
      const pending = getPendingRolloverGlobal();
      if (pending) {
        setPendingRolloverGlobal(null);
        pi.sendUserMessage(pending.prompt);
      }
    }
  });

  pi.on("input", async (event, ctx) => {
    if (event.source === "extension") return { action: "continue" as const };
    const text = event.text?.trim() ?? "";
    if (!CC_COMMAND_PREFIXES.some((prefix) => text === prefix || text.startsWith(`${prefix} `))) {
      return { action: "continue" as const };
    }

    ctx.ui.notify(`Continuous Claude Pi rerouting ${text.split(/\s+/, 1)[0]} through extension command fallback.`, "info");
    pi.sendUserMessage(text);
    return { action: "handled" as const };
  });

  pi.on("before_agent_start", async (_event, ctx) => {
    setFooterStatus(ctx);
    const usage = ctx.getContextUsage();
    if (usage && usage.tokens >= configInfo.config.thresholds.criticalTokens) {
      ctx.ui.notify("Context is near the critical Continuous Claude Pi threshold. Create a handoff soon.", "warning");
    }

    const note = [
      "Continuous Claude Pi active.",
      "Prefer cc_tldr for structural/semantic analysis, cc_bloks for knowledge cards, cc_ouros for persistent research sessions, and cc_fastedit for existing-file modifications when appropriate.",
      `Default workflow roots: ${configInfo.config.storage.continuumRoot}/ and ${configInfo.config.storage.thoughtsSharedRoot}/.`,
      "Pi-native companions remain valuable: pi-fff for fuzzy/text search and Serena for exact symbol-aware edits/refactors.",
    ].join(" ");

    return { systemPrompt: `${_event.systemPrompt}\n\n${note}` };
  });

  pi.on("turn_end", async (_event, ctx) => {
    const sessionFile = ctx.sessionManager.getSessionFile();
    const usage = ctx.getContextUsage();
    if (!shouldAutoRollover(sessionFile, usage?.tokens)) return;

    const handoff = prepareAutoRollover(sessionFile);
    pendingAutoRollover = {
      prompt: buildRolloverPrompt(handoff.path),
      parentSession: sessionFile,
      handoffPath: handoff.path,
    };
    ctx.ui.notify(`Continuous Claude Pi auto-rollover armed before compaction: ${handoff.path}`, "warning");
  });

  pi.on("agent_end", async (_event, ctx) => {
    if (!pendingAutoRollover) {
      const sessionFile = ctx.sessionManager.getSessionFile();
      const usage = ctx.getContextUsage();
      if (shouldAutoRollover(sessionFile, usage?.tokens)) {
        const handoff = prepareAutoRollover(sessionFile);
        pendingAutoRollover = {
          prompt: buildRolloverPrompt(handoff.path),
          parentSession: sessionFile,
          handoffPath: handoff.path,
        };
      }
    }

    if (!pendingAutoRollover) return;

    const { prompt, parentSession, handoffPath } = pendingAutoRollover;
    pendingAutoRollover = null;
    rolloverTimestamp = Date.now();
    (ctx.sessionManager as any).newSession({ parentSession });
    setTimeout(() => {
      pi.sendUserMessage(prompt);
    }, 0);
    ctx.ui.notify(`Continuous Claude Pi opened fresh session from ${handoffPath}`, "info");
  });

  pi.on("tool_call", async (event) => {
    if (event.toolName !== "read" || !configInfo.config.readAssist.enabled) return {};
    const input = event.input as Record<string, unknown>;
    const path = typeof input.path === "string" ? resolveMaybeRelative(activeCwd, input.path) : "";
    if (!path || shouldBypassRead(path, input, configInfo.config.readAssist.smallFileBytes)) return {};

    input.limit = configInfo.config.readAssist.lineLimit;

    const nav = buildNavMapForFile(path, activeCwd);
    if (!nav) return {};

    const raw = readFileSync(path, "utf8");
    const excerpt = raw.split(/\r?\n/).slice(0, configInfo.config.readAssist.lineLimit).join("\n");
    const overlayDir = join(tmpdir(), "continuous-claude-pi-read-assist");
    mkdirSync(overlayDir, { recursive: true });
    const overlayPath = join(overlayDir, `${basename(path).replace(/[^a-zA-Z0-9._-]/g, "_")}-${process.pid}-${Date.now()}.txt`);
    const overlay = [
      "[CC read assist]",
      nav.navMap,
      "",
      "---",
      excerpt,
    ].join("\n");
    writeFileSync(overlayPath, overlay, "utf8");
    input.path = overlayPath;
    return {};
  });

  pi.on("tool_result", async (_event, _ctx) => {
    return {};
  });

  pi.on("context", async (event) => {
    const cutoff = rolloverTimestamp;
    if (cutoff === null) return;
    const messages = event.messages.filter((m: any) => (m?.timestamp ?? 0) >= cutoff);
    if (messages.length > 0) {
      return { messages };
    }
  });

  pi.on("context", async (event) => {
    if (!configInfo.config.diagnostics.enabled || !commandExists("tldr")) return {};

    const messages = event.messages as any[];
    const last = messages.at(-1);
    if (!last || last.role !== "toolResult") return {};
    if ((last.toolName !== "write" && last.toolName !== "edit") || !last.toolCallId) return {};
    if (processedDiagnosticsToolCalls.has(last.toolCallId)) return {};

    let targetPath = "";
    for (let index = messages.length - 2; index >= 0; index -= 1) {
      const message = messages[index];
      if (message?.role !== "assistant" || !Array.isArray(message.content)) continue;
      const toolCall = message.content.find((part: any) => part?.type === "toolCall" && part?.id === last.toolCallId && (part?.name === "write" || part?.name === "edit"));
      if (toolCall?.arguments?.path && typeof toolCall.arguments.path === "string") {
        targetPath = resolveMaybeRelative(activeCwd, toolCall.arguments.path);
        break;
      }
    }

    if (!targetPath || !EDIT_EXTENSIONS.has(extname(targetPath))) {
      processedDiagnosticsToolCalls.add(last.toolCallId);
      return {};
    }

    const diagnostics = runTldr({ command: "diagnostics", target: targetPath, format: "json" }, activeCwd);
    processedDiagnosticsToolCalls.add(last.toolCallId);
    if (!diagnostics.ok) return {};

    const summary = typeof diagnostics.details === "object" && diagnostics.details !== null ? diagnostics.details as Record<string, any> : undefined;
    const errors = Array.isArray(summary?.errors) ? summary.errors.slice(0, 5) : [];
    const lines = [
      `[cc diagnostics] ${basename(targetPath)}`,
      `- type errors: ${summary?.summary?.type_errors ?? summary?.type_errors ?? 0}`,
      `- lint issues: ${summary?.summary?.lint_errors ?? summary?.summary?.lint_issues ?? summary?.lint_errors ?? summary?.lint_issues ?? 0}`,
    ];
    for (const error of errors) {
      const loc = [error.file ? basename(error.file) : basename(targetPath), error.line, error.column].filter(Boolean).join(":");
      lines.push(`- ${loc || basename(targetPath)} ${error.message ?? JSON.stringify(error)}`);
    }
    const diagnosticsText = lines.join("\n");

    return {
      messages: [
        ...messages,
        {
          role: "system",
          content: [{ type: "text", text: diagnosticsText }],
          timestamp: Date.now(),
        },
      ],
    };
  });

  pi.on("session_before_compact", async (event, ctx) => {
    const sessionFile = ctx.sessionManager.getSessionFile();
    if (!sessionFile) return {};
    try {
      if (pendingAutoRollover || shouldAutoRollover(sessionFile, event.preparation?.tokensBefore)) {
        if (!pendingAutoRollover) {
          const handoff = prepareAutoRollover(sessionFile);
          pendingAutoRollover = {
            prompt: buildRolloverPrompt(handoff.path),
            parentSession: sessionFile,
            handoffPath: handoff.path,
          };
        }
        ctx.ui.notify(`Continuous Claude Pi cancelled compaction and will roll over into a new session.`, "warning");
        return { cancel: true };
      }

      const handoff = createHandoffFromSession({ cwd: activeCwd, config: configInfo.config, sessionFile, description: "pre-compact-auto" });
      ctx.ui.notify(`Continuous Claude Pi wrote pre-compact handoff: ${handoff.path}`, "info");
    } catch (error) {
      ctx.ui.notify(`Failed to create pre-compact handoff: ${error instanceof Error ? error.message : String(error)}`, "warning");
    }
    return {};
  });

  pi.registerCommand("cc-check-deps", {
    description: "Check required Continuous Claude Pi dependencies",
    handler: async (_args, ctx) => {
      refreshState(activeCwd);
      ctx.ui.notify(formatDependencyStatus(dependencyStatus), dependencyStatus.missingRequired.length > 0 ? "warning" : "info");
      setFooterStatus(ctx);
    },
  });

  pi.registerCommand("cc-status", {
    description: "Show Continuous Claude Pi status and config",
    handler: async (_args, ctx) => {
      refreshState(activeCwd);
      const lines = [
        formatDependencyStatus(dependencyStatus),
        "",
        `Config path: ${configInfo.path}`,
        `Continuum root: ${resolve(activeCwd, configInfo.config.storage.continuumRoot)}`,
        `Thoughts/shared root: ${resolve(activeCwd, configInfo.config.storage.thoughtsSharedRoot)}`,
        `Auto rollover: ${configInfo.config.autoRollover.enabled ? "on" : "off"} @ ${configInfo.config.autoRollover.thresholdTokens} tokens (cooldown ${configInfo.config.autoRollover.cooldownMs}ms)`,
        `Project config path: ${getProjectConfigPath(activeCwd)}`,
      ];
      ctx.ui.notify(lines.join("\n"), "info");
      setFooterStatus(ctx);
    },
  });

  pi.registerCommand("cc-migrate-rustdex", {
    description: "Remove pi-rustdex package entries from Pi settings files",
    handler: async (_args, ctx) => {
      const result = migrateRustDexSettings(activeCwd);
      if (result.removedEntries === 0) {
        ctx.ui.notify("No pi-rustdex entries found in Pi settings.", "info");
      } else {
        ctx.ui.notify(`Removed ${result.removedEntries} pi-rustdex entries from: ${result.changedFiles.join(", ")}`, "info");
      }
    },
  });

  pi.registerCommand("cc-setup", {
    description: "Run Continuous Claude Pi setup: dependency check + RustDex migration",
    handler: async (_args, ctx) => {
      refreshState(activeCwd);
      const migration = migrateRustDexSettings(activeCwd);
      const configPath = join(getAgentDir(), "continuous-claude-pi.json");
      if (!existsSync(configPath)) {
        writeJsonFile(configPath, DEFAULT_CONFIG);
      }
      const lines = [formatDependencyStatus(dependencyStatus), "", `Config ensured at ${configPath}`];
      if (migration.removedEntries > 0) {
        lines.push(`Removed ${migration.removedEntries} RustDex entries from ${migration.changedFiles.join(", ")}`);
      }
      ctx.ui.notify(lines.join("\n"), dependencyStatus.missingRequired.length > 0 ? "warning" : "info");
      setFooterStatus(ctx);
    },
  });

  pi.registerCommand("cc-create-handoff", {
    description: "Create a Continuous Claude Pi handoff for the current session",
    handler: async (args, ctx) => {
      const sessionFile = ctx.sessionManager.getSessionFile();
      const handoff = createHandoffFromSession({ cwd: activeCwd, config: configInfo.config, sessionFile, description: args?.trim() || "manual-handoff" });
      ctx.ui.notify(`Created handoff: ${handoff.path}`, "info");
    },
  });

  pi.registerCommand("cc-install-agents", {
    description: "Install bundled worker/oracle markdown agents into ~/.pi/agent/agents",
    handler: async (_args, ctx) => {
      const sourceDir = resolve(packageDir, "resources", "agents");
      const targetDir = resolve(getAgentDir(), "agents");
      mkdirSync(targetDir, { recursive: true });
      const copied: string[] = [];
      if (existsSync(sourceDir)) {
        for (const entry of readdirSync(sourceDir)) {
          if (!entry.endsWith(".md")) continue;
          copyFileSync(join(sourceDir, entry), join(targetDir, entry));
          copied.push(entry);
        }
      }
      ctx.ui.notify(copied.length > 0 ? `Installed agents to ${targetDir}: ${copied.join(", ")}` : `No agent resources found at ${sourceDir}`, copied.length > 0 ? "info" : "warning");
    },
  });

  pi.registerCommand("cc-rollover", {
    description: "Create or use a handoff, then open a fresh Pi session and auto-resume from it",
    handler: async (args, ctx) => {
      refreshState(activeCwd);

      const sessionFile = ctx.sessionManager.getSessionFile();
      const handoffPath = args?.trim()
        ? resolveMaybeRelative(activeCwd, args.trim())
        : createHandoffFromSession({
            cwd: activeCwd,
            config: configInfo.config,
            sessionFile,
            description: "manual-rollover",
          }).path;

      const resumePrompt = buildRolloverPrompt(handoffPath);
      saveRolloverGuard({ expiresAt: Date.now() + configInfo.config.autoRollover.cooldownMs });
      setPendingRolloverGlobal({ prompt: resumePrompt });

      const result = await ctx.newSession({
        parentSession: sessionFile ?? undefined,
      });

      if (result.cancelled) {
        setPendingRolloverGlobal(null);
        ctx.ui.notify("Continuous Claude Pi rollover cancelled.", "warning");
        return;
      }
    },
  });

  pi.registerTool({
    name: "cc_stack_status",
    label: "cc_stack_status",
    description: "Show Continuous Claude Pi dependency and configuration status",
    parameters: Type.Object({}),
    async execute() {
      refreshState(activeCwd);
      const text = [formatDependencyStatus(dependencyStatus), `Continuum root: ${resolve(activeCwd, configInfo.config.storage.continuumRoot)}`, `Thoughts/shared root: ${resolve(activeCwd, configInfo.config.storage.thoughtsSharedRoot)}`].join("\n");
      return { content: [{ type: "text", text }], details: { dependencyStatus, config: configInfo.config } };
    },
  });

  pi.registerTool({
    name: "cc_tldr",
    label: "cc_tldr",
    description: "Run tldr-code commands for structural analysis, context extraction, semantic search, review analysis, and diagnostics.",
    parameters: tldrSchema,
    async execute(_toolCallId, params: any) {
      if (!commandExists("tldr")) throw new Error("tldr is not installed");
      const result = runTldr(params, params.path || activeCwd);
      if (!result.ok) throw new Error(result.text || "tldr command failed");
      return { content: [{ type: "text", text: result.text || "tldr completed successfully." }], details: result.details ?? { command: params.command } };
    },
  });

  registerGenericCliTool(pi, {
    name: "cc_bloks",
    binary: "bloks",
    description: "Run bloks commands for context cards, recipes, learns, reports, acks, and nacks.",
  });
  registerGenericCliTool(pi, {
    name: "cc_ouros",
    binary: "ouros",
    description: "Run ouros commands for persistent research sessions, resume/fork flows, and variable inspection.",
  });
  registerGenericCliTool(pi, {
    name: "cc_fastedit",
    binary: "fastedit",
    description: "Run FastEdit commands for existing-file reads, search, diffs, and edit operations.",
  });

  pi.registerTool({
    name: "cc_create_handoff",
    label: "cc_create_handoff",
    description: "Create a Continuous Claude Pi handoff file for the current session.",
    parameters: Type.Object({
      description: Type.Optional(Type.String({ description: "Short kebab-case description for the handoff filename" })),
    }),
    async execute(_toolCallId, params: any, _signal, _onUpdate, ctx) {
      const sessionFile = ctx.sessionManager.getSessionFile();
      const handoff = createHandoffFromSession({ cwd: activeCwd, config: configInfo.config, sessionFile, description: params.description || "tool-handoff" });
      return { content: [{ type: "text", text: `Created handoff at ${handoff.path}` }], details: handoff };
    },
  });

  pi.registerTool({
    name: "cc_contract_init",
    label: "cc_contract_init",
    description: "Initialize a Continuous Claude Pi autonomous or research contract scaffold under continuum/.",
    parameters: Type.Object({
      kind: Type.String({ description: "Either autonomous or research" }),
      title: Type.String({ description: "Task title or research question" }),
      slug: Type.Optional(Type.String({ description: "Optional explicit slug" })),
      scope: Type.Optional(Type.String({ description: "Optional scope/complexity hint" })),
    }),
    async execute(_toolCallId, params: any) {
      const slug = params.slug || slugify(params.title || "task");
      if (params.kind === "research") {
        const base = resolve(activeCwd, configInfo.config.storage.continuumRoot, "research", slug);
        mkdirSync(join(base, "artifacts"), { recursive: true });
        mkdirSync(join(base, "reports"), { recursive: true });
        mkdirSync(join(base, "validation"), { recursive: true });
        const contractPath = join(base, "research_contract.json");
        writeJsonFile(contractPath, {
          question: params.title,
          scope: params.scope || "exploratory",
          iteration: 1,
          ouros_session: slug,
          hypotheses: [],
          accumulated_findings: [],
          iterations_completed: 0,
        });
        return { content: [{ type: "text", text: `Initialized research contract at ${contractPath}` }], details: { kind: params.kind, base, contractPath } };
      }

      const base = resolve(activeCwd, configInfo.config.storage.continuumRoot, "autonomous", slug);
      mkdirSync(join(base, "reports"), { recursive: true });
      mkdirSync(join(base, "validation"), { recursive: true });
      const contractPath = join(base, "contract.json");
      const planPath = join(base, "plan.md");
      writeJsonFile(contractPath, {
        task: params.title,
        complexity: params.scope || "feature",
        milestones: [],
        assertions: [],
      });
      if (!existsSync(planPath)) {
        writeFileSync(planPath, `# Plan\n\nTask: ${params.title}\n`, "utf8");
      }
      return { content: [{ type: "text", text: `Initialized autonomous contract at ${contractPath}` }], details: { kind: params.kind, base, contractPath, planPath } };
    },
  });

  pi.registerTool({
    name: "cc_continuum_status",
    label: "cc_continuum_status",
    description: "Inspect the latest Continuous Claude Pi autonomous and research artifact roots.",
    parameters: Type.Object({}),
    async execute() {
      const continuumRoot = resolve(activeCwd, configInfo.config.storage.continuumRoot);
      const autonomousRoot = join(continuumRoot, "autonomous");
      const researchRoot = join(continuumRoot, "research");
      const list = (root: string) => existsSync(root) ? readdirSync(root).sort() : [];
      const autonomous = list(autonomousRoot);
      const research = list(researchRoot);
      const text = [
        `Continuum root: ${continuumRoot}`,
        `Autonomous tasks: ${autonomous.join(", ") || "none"}`,
        `Research topics: ${research.join(", ") || "none"}`,
      ].join("\n");
      return { content: [{ type: "text", text }], details: { continuumRoot, autonomous, research } };
    },
  });
}
