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
  type?: 'standard' | 'overlay';
  linkedAt?: string;
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

export class RegistryCorruptedError extends Error {
  constructor(
    public readonly filePath: string,
    cause?: unknown,
  ) {
    super(
      `Registry file "${filePath}" is corrupted and cannot be parsed. Repair or delete it to continue.`,
    );
    this.name = 'RegistryCorruptedError';
    this.cause = cause;
  }
}

export function readRegistry<T>(filePath: string, defaultValue: T): T {
  if (!existsSync(filePath)) {
    return defaultValue;
  }
  const raw = readFileSync(filePath, 'utf-8');
  try {
    return JSON.parse(raw) as T;
  } catch (err) {
    throw new RegistryCorruptedError(filePath, err);
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
