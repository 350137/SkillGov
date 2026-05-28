// Registry read/write operations for JSON state files — skills, compatibility, installs records with automatic directory creation.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export interface SkillEntry {
  name: string;
  sourcePath: string;
  origin: string;
  fileHash: string;
  importedAt: string;
  validationStatus: 'pending' | 'pass' | 'fixable' | 'fail';
}

export interface SkillsRegistry {
  skills: Record<string, SkillEntry>;
}

export interface CompatibilityEntry {
  skillName: string;
  target: string;
  status: 'compatible' | 'needs-mapping' | 'needs-overlay' | 'unsupported' | 'unknown';
  notes?: string;
  checkedAt: string;
}

export interface CompatibilityRegistry {
  entries: CompatibilityEntry[];
}

export interface InstallRecord {
  skillName: string;
  target: string;
  installedAt: string;
  type: 'standard' | 'overlay';
  linkPath: string;
}

export interface InstallsRegistry {
  installs: Record<string, InstallRecord>;
}

export type SkillMappingTarget = string;

export interface SkillMappingLink {
  path: string;
  mode: 'junction' | 'symlink' | 'copy';
  status: 'linked' | 'missing' | 'conflict';
  backupPath?: string;
  updatedAt: string;
}

export interface SkillMapping {
  skillName: string;
  canonicalPath: string;
  links: Partial<Record<SkillMappingTarget, SkillMappingLink>>;
  updatedAt: string;
}

export interface SkillMappingsRegistry {
  mappings: Record<string, SkillMapping>;
}

function ensureDir(path: string): void {
  const dir = dirname(path);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

export function readRegistry<T>(filePath: string, defaultValue: T): T {
  if (!existsSync(filePath)) {
    return defaultValue;
  }
  try {
    const raw = readFileSync(filePath, 'utf-8');
    return JSON.parse(raw) as T;
  } catch {
    return defaultValue;
  }
}

export function writeRegistry<T>(filePath: string, data: T): void {
  ensureDir(filePath);
  writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

export function addSkillEntry(registryPath: string, entry: Omit<SkillEntry, 'importedAt'>): void {
  const registry = readRegistry<SkillsRegistry>(registryPath, { skills: {} });

  if (registry.skills[entry.name]) {
    throw new Error(
      `Skill "${entry.name}" already exists in registry. Remove it first or use a different name.`,
    );
  }

  registry.skills[entry.name] = {
    ...entry,
    importedAt: new Date().toISOString(),
  };

  writeRegistry(registryPath, registry);
}
