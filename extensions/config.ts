import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { getAgentDir } from "@mariozechner/pi-coding-agent";
import { readJsonFile, writeJsonFile } from "./utils.js";

export interface ContinuousClaudePiConfig {
  storage: {
    continuumRoot: string;
    thoughtsSharedRoot: string;
  };
  thresholds: {
    warnTokens: number;
    criticalTokens: number;
  };
  readAssist: {
    enabled: boolean;
    lineLimit: number;
    smallFileBytes: number;
  };
  diagnostics: {
    enabled: boolean;
  };
  fastedit: {
    enabled: boolean;
  };
  autoRollover: {
    enabled: boolean;
    thresholdTokens: number;
    cooldownMs: number;
  };
}

export const DEFAULT_CONFIG: ContinuousClaudePiConfig = {
  storage: {
    continuumRoot: "continuum",
    thoughtsSharedRoot: join("thoughts", "shared"),
  },
  thresholds: {
    warnTokens: 120_000,
    criticalTokens: 160_000,
  },
  readAssist: {
    enabled: true,
    lineLimit: 200,
    smallFileBytes: 1500,
  },
  diagnostics: {
    enabled: true,
  },
  fastedit: {
    enabled: true,
  },
  autoRollover: {
    enabled: true,
    thresholdTokens: 160_000,
    cooldownMs: 60_000,
  },
};

export function getGlobalConfigPath(): string {
  return join(getAgentDir(), "continuous-claude-pi.json");
}

export function getProjectConfigPath(cwd: string): string {
  return resolve(cwd, ".pi", "continuous-claude-pi.json");
}

export function loadConfig(cwd: string): { config: ContinuousClaudePiConfig; path: string } {
  const globalPath = getGlobalConfigPath();
  const projectPath = getProjectConfigPath(cwd);
  const global = readJsonFile<Partial<ContinuousClaudePiConfig>>(globalPath, {});
  const project = existsSync(projectPath) ? readJsonFile<Partial<ContinuousClaudePiConfig>>(projectPath, {}) : {};

  return {
    path: existsSync(projectPath) ? projectPath : globalPath,
    config: {
      ...DEFAULT_CONFIG,
      ...global,
      ...project,
      storage: { ...DEFAULT_CONFIG.storage, ...global.storage, ...project.storage },
      thresholds: { ...DEFAULT_CONFIG.thresholds, ...global.thresholds, ...project.thresholds },
      readAssist: { ...DEFAULT_CONFIG.readAssist, ...global.readAssist, ...project.readAssist },
      diagnostics: { ...DEFAULT_CONFIG.diagnostics, ...global.diagnostics, ...project.diagnostics },
      fastedit: { ...DEFAULT_CONFIG.fastedit, ...global.fastedit, ...project.fastedit },
      autoRollover: { ...DEFAULT_CONFIG.autoRollover, ...global.autoRollover, ...project.autoRollover },
    },
  };
}

export function saveGlobalConfig(config: ContinuousClaudePiConfig): string {
  const path = getGlobalConfigPath();
  writeJsonFile(path, config);
  return path;
}

export function getContinuumRoot(cwd: string, config: ContinuousClaudePiConfig): string {
  return resolve(cwd, config.storage.continuumRoot);
}

export function getThoughtsSharedRoot(cwd: string, config: ContinuousClaudePiConfig): string {
  return resolve(cwd, config.storage.thoughtsSharedRoot);
}

export function getHandoffBaseDir(cwd: string, config: ContinuousClaudePiConfig): string {
  return resolve(dirname(getThoughtsSharedRoot(cwd, config)), "shared", "handoffs");
}

export function getAutoRolloverGuardPath(): string {
  return join(getAgentDir(), "continuous-claude-pi-rollover-guard.json");
}
