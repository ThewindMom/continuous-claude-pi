import { commandExists, runCommand, trimTo } from "./utils.js";

export interface DependencyCheck {
  name: string;
  required: boolean;
  available: boolean;
  version?: string;
  note?: string;
}

export interface DependencyStatus {
  checks: DependencyCheck[];
  missingRequired: string[];
  warnings: string[];
}

function getVersion(command: string, args: string[] = ["--version"]): string | undefined {
  const result = runCommand(command, args, { timeoutMs: 10_000 });
  if (!result.ok) return undefined;
  return trimTo((result.stdout || result.stderr).trim(), 160);
}

export function checkDependencies(): DependencyStatus {
  const checks: DependencyCheck[] = [];

  const coreCommands = [
    { name: "tldr", required: true },
    { name: "bloks", required: true },
    { name: "ouros", required: true },
    { name: "fastedit", required: true },
  ];

  for (const item of coreCommands) {
    const available = commandExists(item.name);
    checks.push({
      name: item.name,
      required: item.required,
      available,
      version: available ? getVersion(item.name) : undefined,
    });
  }

  const semanticAvailable = commandExists("tldr")
    ? runCommand("tldr", ["semantic", "--help"], { timeoutMs: 10_000 }).ok
    : false;
  checks.push({
    name: "tldr-semantic-feature",
    required: true,
    available: semanticAvailable,
    note: "semantic search requires tldr installed with semantic support",
  });

  checks.push({
    name: "EXA_API_KEY",
    required: false,
    available: Boolean(process.env.EXA_API_KEY),
    note: "Needed for Exa-backed research bridges",
  });
  checks.push({
    name: "NIA_API_KEY",
    required: false,
    available: Boolean(process.env.NIA_API_KEY),
    note: "Needed for NIA-backed research bridges",
  });

  const missingRequired = checks.filter((check) => check.required && !check.available).map((check) => check.name);
  const warnings = checks.filter((check) => !check.required && !check.available).map((check) => `${check.name} missing: ${check.note ?? "optional capability unavailable"}`);

  return { checks, missingRequired, warnings };
}

export function formatDependencyStatus(status: DependencyStatus): string {
  const lines = ["Continuous Claude Pi dependency status:"];
  for (const check of status.checks) {
    const marker = check.available ? "✓" : check.required ? "✗" : "!";
    const tail = check.version ? ` — ${check.version}` : check.note ? ` — ${check.note}` : "";
    lines.push(`- ${marker} ${check.name}${tail}`);
  }
  if (status.missingRequired.length > 0) {
    lines.push(`Missing required: ${status.missingRequired.join(", ")}`);
  }
  if (status.warnings.length > 0) {
    lines.push(...status.warnings.map((warning) => `Warning: ${warning}`));
  }
  return lines.join("\n");
}
