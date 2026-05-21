// Config schema, loading, validation, and writing for skillgov.config.json — normalises paths and merges user values with defaults.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

export interface SkillGovConfig {
  projectRoot: string;
  defaultLinkMode: 'junction' | 'symlink' | 'copy';
  targets: string[];
}

const VALID_LINK_MODES = new Set(['junction', 'symlink', 'copy']);

export function normalizePath(p: string): string {
  return p.replace(/\\/g, '/');
}

export function defaultConfig(projectRoot?: string): SkillGovConfig {
  return {
    projectRoot: normalizePath(projectRoot || process.cwd()),
    defaultLinkMode: 'junction',
    targets: ['claude', 'codex'],
  };
}

export function loadConfig(configPath?: string): SkillGovConfig {
  const defaults = defaultConfig();

  if (!configPath || !existsSync(configPath)) {
    return defaults;
  }

  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(readFileSync(configPath, 'utf-8'));
  } catch {
    throw new Error(`Invalid config file at "${configPath}". Ensure the file contains valid JSON.`);
  }

  if (raw.defaultLinkMode !== undefined) {
    if (!VALID_LINK_MODES.has(raw.defaultLinkMode as string)) {
      throw new Error(
        `Invalid defaultLinkMode "${String(raw.defaultLinkMode)}". Must be one of: junction, symlink, copy.`,
      );
    }
  }

  const cfg: SkillGovConfig = {
    projectRoot: normalizePath(
      typeof raw.projectRoot === 'string' ? raw.projectRoot : defaults.projectRoot,
    ),
    defaultLinkMode:
      (raw.defaultLinkMode as SkillGovConfig['defaultLinkMode']) || defaults.defaultLinkMode,
    targets: Array.isArray(raw.targets) ? (raw.targets as string[]) : defaults.targets,
  };

  return cfg;
}

export function writeConfig(config: SkillGovConfig, configPath: string, dryRun = false): void {
  if (dryRun) return;
  writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
}
