// Skill mapping registry and link management keep agent skill directories pointed at SkillGov-managed skills.
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { readRegistry, writeRegistry } from './registry.js';
import type {
  InstallRecord,
  InstallsRegistry,
  SkillMapping,
  SkillMappingLink,
  SkillMappingTarget,
  SkillMappingsRegistry,
} from './registry.js';
import { type TargetProfile, getTargetProfile } from './targets.js';

export interface LinkManagedSkillOptions {
  projectRoot: string;
  mappingsPath: string;
  targetSkillRoot?: string;
  targetProfiles?: TargetProfile[];
  backupsRoot?: string;
  linkMode?: SkillMappingLink['mode'];
  type?: 'standard' | 'overlay';
}

export interface LinkManagedSkillResult {
  status: 'linked' | 'not-found' | 'blocked';
  skillName: string;
  targetName: string;
  canonicalPath: string;
  linkPath: string;
  backupPath?: string;
  message: string;
}

export interface MappingTargetStatus {
  target: SkillMappingTarget;
  path: string;
  mode: SkillMappingLink['mode'];
  status: SkillMappingLink['status'];
}

export function readSkillMappings(mappingsPath: string): SkillMappingsRegistry {
  return readRegistry<SkillMappingsRegistry>(mappingsPath, { mappings: {} });
}

function writeSkillMappings(mappingsPath: string, registry: SkillMappingsRegistry): void {
  writeRegistry(mappingsPath, registry);
}

function copyDir(src: string, dest: string): void {
  mkdirSync(dest, { recursive: true });
  for (const entry of readdirSync(src)) {
    const srcPath = resolve(src, entry);
    const destPath = resolve(dest, entry);
    const stat = statSync(srcPath);
    if (stat.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      copyFileSync(srcPath, destPath);
    }
  }
}

function timestampForPath(): string {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function pathsResolveToSameLocation(left: string, right: string): boolean {
  if (!existsSync(left) || !existsSync(right)) return false;
  try {
    return realpathSync.native(left).toLowerCase() === realpathSync.native(right).toLowerCase();
  } catch {
    return false;
  }
}

function assessExistingLink(linkPath: string, canonicalPath: string): SkillMappingLink['status'] {
  if (!existsSync(linkPath)) return 'missing';
  if (!existsSync(join(linkPath, 'SKILL.md'))) return 'conflict';
  return pathsResolveToSameLocation(linkPath, canonicalPath) ? 'linked' : 'conflict';
}

function createLink(source: string, targetPath: string, linkMode: SkillMappingLink['mode']): void {
  mkdirSync(dirname(targetPath), { recursive: true });
  if (linkMode === 'copy') {
    copyDir(source, targetPath);
    return;
  }
  symlinkSync(source, targetPath, linkMode === 'junction' ? 'junction' : 'dir');
}

export function upsertMapping(
  mappingsPath: string,
  skillName: string,
  canonicalPath: string,
  targetName: SkillMappingTarget,
  link: SkillMappingLink,
): void {
  const registry = readSkillMappings(mappingsPath);
  const now = new Date().toISOString();
  const existing: SkillMapping = registry.mappings[skillName] || {
    skillName,
    canonicalPath,
    links: {},
    updatedAt: now,
  };
  existing.canonicalPath = canonicalPath;
  existing.links[targetName] = link;
  existing.updatedAt = now;
  registry.mappings[skillName] = existing;
  writeSkillMappings(mappingsPath, registry);
}

export function removeMappingLink(
  mappingsPath: string,
  skillName: string,
  targetName: SkillMappingTarget,
): boolean {
  const registry = readSkillMappings(mappingsPath);
  const mapping = registry.mappings[skillName];
  if (!mapping || !mapping.links[targetName]) return false;
  delete mapping.links[targetName];
  mapping.updatedAt = new Date().toISOString();
  if (Object.keys(mapping.links).length === 0) {
    delete registry.mappings[skillName];
  }
  writeSkillMappings(mappingsPath, registry);
  return true;
}

export function getMappingTargets(skillName: string, mappingsPath?: string): MappingTargetStatus[] {
  if (!mappingsPath) return [];
  const registry = readSkillMappings(mappingsPath);
  const mapping = registry.mappings[skillName];
  if (!mapping) return [];

  return Object.entries(mapping.links).flatMap(([target, link]) => {
    if (!link) return [];
    const status = assessExistingLink(link.path, mapping.canonicalPath);
    return [
      {
        target: target as SkillMappingTarget,
        path: link.path,
        mode: link.mode,
        status,
      },
    ];
  });
}

export function linkManagedSkillToAgent(
  skillName: string,
  targetName: SkillMappingTarget,
  options: LinkManagedSkillOptions,
): LinkManagedSkillResult {
  const canonicalPath = resolve(options.projectRoot, 'skills', skillName);
  const canonicalSkillMd = join(canonicalPath, 'SKILL.md');
  const profile = getTargetProfile(targetName, options.targetProfiles);
  const targetRoot = options.targetSkillRoot || profile?.skillDirs[0];
  const linkMode = options.linkMode || profile?.linkMode || 'junction';

  if (!existsSync(canonicalSkillMd)) {
    return {
      status: 'not-found',
      skillName,
      targetName,
      canonicalPath,
      linkPath: targetRoot ? resolve(targetRoot, skillName) : '',
      message: `Managed skill "${skillName}" is missing SKILL.md.`,
    };
  }

  if (!targetRoot) {
    return {
      status: 'blocked',
      skillName,
      targetName,
      canonicalPath,
      linkPath: '',
      message: `Unknown target: "${targetName}".`,
    };
  }

  const linkPath = resolve(targetRoot, skillName);
  let backupPath: string | undefined;

  if (existsSync(linkPath)) {
    if (!pathsResolveToSameLocation(linkPath, canonicalPath)) {
      const backupsRoot = resolve(options.backupsRoot || join(options.projectRoot, 'backups'));
      backupPath = join(backupsRoot, timestampForPath(), targetName, skillName);
      copyDir(linkPath, backupPath);
      rmSync(linkPath, { recursive: true, force: true });
    }
  }

  if (!existsSync(linkPath)) {
    createLink(canonicalPath, linkPath, linkMode);
  }

  const now = new Date().toISOString();
  const link: SkillMappingLink = {
    path: linkPath,
    mode: linkMode,
    status: assessExistingLink(linkPath, canonicalPath),
    type: options.type || 'standard',
    linkedAt: now,
    backupPath,
    updatedAt: now,
  };
  upsertMapping(options.mappingsPath, skillName, canonicalPath, targetName, link);

  return {
    status: 'linked',
    skillName,
    targetName,
    canonicalPath,
    linkPath,
    backupPath,
    message: `Linked "${skillName}" to ${targetName} at ${linkPath}.`,
  };
}

export interface MigrationResult {
  migrated: number;
  skipped: number;
  errors: Array<{ key: string; reason: string }>;
}

/**
 * Migrate install records from installs.json into mappings.json.
 * Each record is verified against the real filesystem before migration:
 * - linkPath must exist
 * - linkPath must contain SKILL.md
 * - linkPath must resolve to the expected canonical path
 * Records that fail verification are skipped with an error reason.
 */
export function migrateInstallsToMappings(
  installsPath: string,
  mappingsPath: string,
  projectRoot: string,
): MigrationResult {
  const installs = readRegistry<InstallsRegistry>(installsPath, { installs: {} });
  const mappings = readSkillMappings(mappingsPath);
  const result: MigrationResult = { migrated: 0, skipped: 0, errors: [] };

  for (const [key, record] of Object.entries(installs.installs)) {
    const canonicalPath = resolve(projectRoot, 'skills', record.skillName);

    // Verify linkPath exists
    if (!existsSync(record.linkPath)) {
      result.skipped++;
      result.errors.push({ key, reason: `linkPath "${record.linkPath}" does not exist` });
      continue;
    }

    // Verify SKILL.md exists inside
    if (!existsSync(join(record.linkPath, 'SKILL.md'))) {
      result.skipped++;
      result.errors.push({ key, reason: `linkPath "${record.linkPath}" has no SKILL.md` });
      continue;
    }

    // Verify linkPath resolves to canonical path (is actually a managed link)
    if (!pathsResolveToSameLocation(record.linkPath, canonicalPath)) {
      result.skipped++;
      result.errors.push({
        key,
        reason: `linkPath "${record.linkPath}" does not resolve to canonical "${canonicalPath}"`,
      });
      continue;
    }

    // Determine mode from existing mapping or default to junction
    const existingMapping = mappings.mappings[record.skillName];
    const existingLink = existingMapping?.links[record.target];
    const mode = existingLink?.mode || 'junction';

    // Upsert into mappings
    const now = new Date().toISOString();
    const mapping: SkillMapping = existingMapping || {
      skillName: record.skillName,
      canonicalPath,
      links: {},
      updatedAt: now,
    };
    mapping.canonicalPath = canonicalPath;
    mapping.links[record.target] = {
      path: record.linkPath,
      mode,
      status: 'linked',
      type: record.type,
      linkedAt: record.installedAt,
      ...(existingLink?.backupPath ? { backupPath: existingLink.backupPath } : {}),
      updatedAt: now,
    };
    mapping.updatedAt = now;
    mappings.mappings[record.skillName] = mapping;
    result.migrated++;
  }

  if (result.migrated > 0) {
    writeSkillMappings(mappingsPath, mappings);
  }

  return result;
}
