// Config schema, loading, validation, and writing for skillgov.config.json — normalises paths and merges user values with defaults.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

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
  const resolvedConfigPath = configPath || `${process.cwd()}/skillgov.config.json`;
  const defaults = defaultConfig();

  if (!existsSync(resolvedConfigPath)) {
    return defaults;
  }

  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(readFileSync(resolvedConfigPath, 'utf-8'));
  } catch {
    throw new Error(
      `Invalid config file at "${resolvedConfigPath}". Ensure the file contains valid JSON.`,
    );
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
  const dir = dirname(configPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
}
