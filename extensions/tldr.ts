import { Type } from "@sinclair/typebox";
import type { Static } from "@sinclair/typebox";
import { rel, resolveMaybeRelative, runCommand, textFromContentBlocks, trimTo, tryParseJson } from "./utils.js";

export const tldrSchema = Type.Object({
  command: Type.String({ description: "TLDR command such as extract, structure, impact, context, semantic, smells, secure, bugbot, whatbreaks, health" }),
  target: Type.Optional(Type.String({ description: "Primary target argument, e.g. file path, function name, or semantic query" })),
  path: Type.Optional(Type.String({ description: "Path/project argument where applicable" })),
  extraArgs: Type.Optional(Type.Array(Type.String(), { description: "Extra CLI args appended verbatim" })),
  format: Type.Optional(Type.String({ description: "Output format; default json" })),
});
export type TldrInput = Static<typeof tldrSchema>;

export interface TldrExtractSummary {
  title: string;
  navMap: string;
}

export function runTldr(input: TldrInput, cwd: string): { ok: boolean; text: string; details?: unknown } {
  const args: string[] = [input.command];
  if (input.target) args.push(input.target);
  if (input.path) args.push(input.path);
  args.push("--format", input.format ?? "json");
  if (input.extraArgs) args.push(...input.extraArgs);

  const result = runCommand("tldr", args, { cwd, timeoutMs: 30_000 });
  const text = result.ok ? (result.stdout || result.stderr).trim() : (result.stderr || result.error || result.stdout).trim();
  return {
    ok: result.ok,
    text,
    details: tryParseJson(text),
  };
}

export function buildNavMapForFile(filePath: string, cwd: string): TldrExtractSummary | undefined {
  const absPath = resolveMaybeRelative(cwd, filePath);
  const result = runTldr({ command: "extract", target: absPath, format: "json" }, cwd);
  if (!result.ok || !result.details || typeof result.details !== "object") return undefined;
  const data = result.details as Record<string, any>;
  const lines: string[] = [];
  const title = rel(absPath, cwd);
  lines.push(`# ${title}`);

  const imports = Array.isArray(data.imports) ? data.imports.slice(0, 20) : [];
  if (imports.length > 0) {
    lines.push("## Imports");
    for (const item of imports) {
      if (typeof item === "string") lines.push(`- ${item}`);
      else if (item && typeof item === "object") lines.push(`- ${item.module ?? item.name ?? JSON.stringify(item)}`);
    }
  }

  const functions = Array.isArray(data.functions) ? data.functions.slice(0, 30) : [];
  if (functions.length > 0) {
    lines.push("## Functions");
    for (const fn of functions) {
      if (!fn || typeof fn !== "object") continue;
      const params = Array.isArray(fn.params) ? fn.params.join(", ") : "";
      const line = fn.line_number ?? fn.line ?? "?";
      const ret = fn.return_type ? ` -> ${fn.return_type}` : "";
      lines.push(`- ${fn.name ?? "anonymous"}(${params})${ret} [L${line}]`);
    }
  }

  const classes = Array.isArray(data.classes) ? data.classes.slice(0, 20) : [];
  if (classes.length > 0) {
    lines.push("## Classes");
    for (const cls of classes) {
      if (!cls || typeof cls !== "object") continue;
      const line = cls.line_number ?? cls.line ?? "?";
      lines.push(`- ${cls.name ?? "anonymous"} [L${line}]`);
      if (Array.isArray(cls.methods)) {
        for (const method of cls.methods.slice(0, 10)) {
          const mLine = method?.line_number ?? method?.line ?? "?";
          lines.push(`  - .${method?.name ?? "method"} [L${mLine}]`);
        }
      }
    }
  }

  if (lines.length <= 1) return undefined;
  lines.push("", "Use targeted reads with offset/limit or Serena symbol tools for exact edits.");
  return { title, navMap: lines.join("\n") };
}

export function appendDiagnosticsText(existingContent: Array<{ type: string; text?: string }>, diagnosticsText: string): Array<{ type: string; text?: string }> {
  const current = textFromContentBlocks(existingContent as Array<{ type: string; text?: string }>);
  const next = current ? `${current}\n\n[cc diagnostics]\n${diagnosticsText}` : `[cc diagnostics]\n${diagnosticsText}`;
  return [{ type: "text", text: trimTo(next, 24_000) }];
}
