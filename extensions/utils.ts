import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";

export interface CommandResult {
  ok: boolean;
  command: string;
  args: string[];
  stdout: string;
  stderr: string;
  exitCode: number | null;
  error?: string;
}

export function runCommand(command: string, args: string[], options?: { cwd?: string; timeoutMs?: number; input?: string }): CommandResult {
  try {
    const result = spawnSync(command, args, {
      cwd: options?.cwd,
      encoding: "utf-8",
      timeout: options?.timeoutMs ?? 30_000,
      input: options?.input,
    });

    return {
      ok: result.status === 0 && !result.error,
      command,
      args,
      stdout: result.stdout ?? "",
      stderr: result.stderr ?? "",
      exitCode: result.status,
      error: result.error?.message,
    };
  } catch (error) {
    return {
      ok: false,
      command,
      args,
      stdout: "",
      stderr: "",
      exitCode: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export function commandExists(command: string): boolean {
  const whichCommand = process.platform === "win32" ? "where" : "which";
  return runCommand(whichCommand, [command], { timeoutMs: 5_000 }).ok;
}

export function tryParseJson(text: string): unknown | undefined {
  const trimmed = text.trim();
  if (!trimmed) return undefined;
  try {
    return JSON.parse(trimmed);
  } catch {
    return undefined;
  }
}

export function ensureParentDir(filePath: string): void {
  mkdirSync(dirname(filePath), { recursive: true });
}

export function readJsonFile<T>(filePath: string, fallback: T): T {
  try {
    if (!existsSync(filePath)) return fallback;
    return JSON.parse(readFileSync(filePath, "utf8")) as T;
  } catch {
    return fallback;
  }
}

export function writeJsonFile(filePath: string, value: unknown): void {
  ensureParentDir(filePath);
  writeFileSync(filePath, JSON.stringify(value, null, 2) + "\n", "utf8");
}

export function rel(pathLike: string, cwd: string): string {
  const abs = isAbsolute(pathLike) ? pathLike : resolve(cwd, pathLike);
  const relPath = relative(cwd, abs);
  return relPath && !relPath.startsWith("..") ? relPath : abs;
}

export function resolveMaybeRelative(cwd: string, pathLike: string): string {
  return isAbsolute(pathLike) ? pathLike : resolve(cwd, pathLike);
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) || "general";
}

export function nowStamp(): { date: string; iso: string; fileTimestamp: string } {
  const now = new Date();
  const iso = now.toISOString();
  const date = iso.slice(0, 10);
  const fileTimestamp = `${date}_${iso.slice(11, 16).replace(":", "-")}`;
  return { date, iso, fileTimestamp };
}

export function textFromContentBlocks(content: unknown): string {
  if (!content) return "";
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((part): part is { type?: string; text?: string } => Boolean(part) && typeof part === "object")
    .filter((part) => part.type === "text" && typeof part.text === "string")
    .map((part) => part.text ?? "")
    .join("\n");
}

export function firstNonEmptyLine(text: string): string {
  return text.split(/\r?\n/).map((line) => line.trim()).find(Boolean) ?? "";
}

export function trimTo(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(0, maxChars - 1))}…`;
}

export function joinPath(base: string, ...parts: string[]): string {
  return join(base, ...parts);
}
