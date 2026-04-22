import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { getAgentDir } from "@mariozechner/pi-coding-agent";
import { readJsonFile, writeJsonFile } from "./utils.js";

interface PiSettingsFile {
  packages?: Array<string | { source?: string }>;
  [key: string]: unknown;
}

function removeRustDexEntries(settings: PiSettingsFile): { changed: boolean; removed: number } {
  const original = settings.packages ?? [];
  const filtered = original.filter((entry) => {
    if (typeof entry === "string") return !entry.includes("pi-rustdex");
    return !(entry.source ?? "").includes("pi-rustdex");
  });
  settings.packages = filtered;
  return { changed: filtered.length !== original.length, removed: original.length - filtered.length };
}

export function migrateRustDexSettings(cwd: string): { changedFiles: string[]; removedEntries: number } {
  const targets = [
    resolve(getAgentDir(), "settings.json"),
    resolve(cwd, ".pi", "settings.json"),
  ];

  const changedFiles: string[] = [];
  let removedEntries = 0;

  for (const target of targets) {
    if (!existsSync(target)) continue;
    const settings = readJsonFile<PiSettingsFile>(target, {});
    const result = removeRustDexEntries(settings);
    if (result.changed) {
      writeJsonFile(target, settings);
      changedFiles.push(target);
      removedEntries += result.removed;
    }
  }

  return { changedFiles, removedEntries };
}
