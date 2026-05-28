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

function upsertMapping(
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

export function getMappingTargets(skillName: string, mappingsPath?: string): MappingTargetStatus[] {
  if (!mappingsPath) return [];
  const registry = readSkillMappings(mappingsPath);
  const mapping = registry.mappings[skillName];
  if (!mapping) return [];

  return Object.entries(mapping.links).map(([target, link]) => {
    const status = assessExistingLink(link.path, mapping.canonicalPath);
    return {
      target: target as SkillMappingTarget,
      path: link.path,
      mode: link.mode,
      status,
    };
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

  const link: SkillMappingLink = {
    path: linkPath,
    mode: linkMode,
    status: assessExistingLink(linkPath, canonicalPath),
    backupPath,
    updatedAt: new Date().toISOString(),
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
