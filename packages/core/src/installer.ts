// Installer module — routes skills to target agent directories using links (junction, symlink, or copy). Records installs and supports rollback.
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  statSync,
  symlinkSync,
} from 'node:fs';
import { dirname, resolve } from 'node:path';
import { checkCompatibility } from './compat.js';
import {
  linkManagedSkillToAgent,
  readSkillMappings,
  removeMappingLink,
  upsertMapping,
} from './mapping.js';
import { appendOperation, readOperations } from './operations.js';
import type { Operation } from './operations.js';
import type { SkillMappingLink } from './registry.js';
import { type TargetProfile, getTargetProfile } from './targets.js';

export type LinkMode = 'junction' | 'symlink' | 'copy';

export interface InstallOptions {
  projectRoot: string;
  operationsPath: string;
  mappingsPath: string;
  targetSkillRoot?: string;
  targetProfiles?: TargetProfile[];
}

export interface InstallResult {
  status: 'installed' | 'blocked' | 'not-found';
  skillName: string;
  targetName: string;
  linkPath: string;
  message: string;
  operation?: Operation;
}

function resolveSkillSource(
  projectRoot: string,
  skillName: string,
  targetName: string,
): string | null {
  // Prefer overlay if it exists
  const overlayDir = resolve(projectRoot, 'overlays', targetName, skillName);
  if (existsSync(overlayDir)) return overlayDir;
  // Fall back to standard skill
  const standardDir = resolve(projectRoot, 'skills', skillName);
  if (existsSync(standardDir)) return standardDir;
  return null;
}

function getTargetSkillDir(
  targetName: string,
  skillName: string,
  targetSkillRoot?: string,
  targetProfiles?: TargetProfile[],
): string | null {
  if (targetSkillRoot) return resolve(targetSkillRoot, skillName);
  const profile = getTargetProfile(targetName, targetProfiles);
  if (!profile || profile.skillDirs.length === 0) return null;
  return resolve(profile.skillDirs[0], skillName);
}

function copyDir(src: string, dest: string): void {
  mkdirSync(dest, { recursive: true });
  const entries = readdirSync(src);
  for (const entry of entries) {
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

function createLink(source: string, targetPath: string, linkMode: LinkMode): void {
  // Remove existing path if it exists
  if (existsSync(targetPath)) {
    rmSync(targetPath, { recursive: true, force: true });
  }
  mkdirSync(dirname(targetPath), { recursive: true });

  switch (linkMode) {
    case 'junction':
      symlinkSync(source, targetPath, 'junction');
      break;
    case 'symlink':
      symlinkSync(source, targetPath, 'dir');
      break;
    case 'copy':
      copyDir(source, targetPath);
      break;
  }
}

export function installSkill(
  skillName: string,
  targetName: string,
  linkMode: LinkMode,
  options: InstallOptions,
): InstallResult {
  const { projectRoot, operationsPath, mappingsPath } = options;

  // 1. Find skill source
  const skillSource = resolveSkillSource(projectRoot, skillName, targetName);
  if (!skillSource) {
    return {
      status: 'not-found',
      skillName,
      targetName,
      linkPath: '',
      message: `Skill "${skillName}" not found in skills/ or overlays/${targetName}/.`,
    };
  }

  // 2. Check compatibility
  const compat = checkCompatibility(skillSource, targetName, {
    targetProfiles: options.targetProfiles,
  });
  if (
    compat.status === 'unsupported' ||
    compat.status === 'unknown' ||
    compat.status === 'needs-overlay'
  ) {
    return {
      status: 'blocked',
      skillName,
      targetName,
      linkPath: '',
      message: `Skill "${skillName}" is ${compat.status} on "${targetName}". Install blocked.`,
    };
  }

  // 3. Determine target directory
  const targetSkillDir = getTargetSkillDir(
    targetName,
    skillName,
    options.targetSkillRoot,
    options.targetProfiles,
  );
  if (!targetSkillDir) {
    return {
      status: 'blocked',
      skillName,
      targetName,
      linkPath: '',
      message: `Unknown target: "${targetName}".`,
    };
  }

  const isOverlay = skillSource.includes('overlays');
  const type: 'standard' | 'overlay' = isOverlay ? 'overlay' : 'standard';

  if (isOverlay) {
    // Overlays: create link directly, then record in mappings
    createLink(skillSource, targetSkillDir, linkMode);
    const now = new Date().toISOString();
    const link: SkillMappingLink = {
      path: targetSkillDir,
      mode: linkMode,
      status: 'linked',
      type: 'overlay',
      linkedAt: now,
      updatedAt: now,
    };
    upsertMapping(mappingsPath, skillName, skillSource, targetName, link);
  } else {
    // Standard: use mapping link manager (writes to mappings.json internally)
    const mapping = linkManagedSkillToAgent(skillName, targetName, {
      projectRoot,
      mappingsPath,
      targetSkillRoot: options.targetSkillRoot,
      targetProfiles: options.targetProfiles,
      linkMode,
    });
    if (mapping.status !== 'linked') {
      return {
        status: 'blocked',
        skillName,
        targetName,
        linkPath: mapping.linkPath,
        message: mapping.message,
      };
    }
  }

  // 5. Log operation
  const op = appendOperation(operationsPath, {
    action: 'install',
    skill: skillName,
    target: targetName,
    status: 'completed',
    details: { linkPath: targetSkillDir, linkMode, type },
  });

  return {
    status: 'installed',
    skillName,
    targetName,
    linkPath: targetSkillDir,
    message: `Installed "${skillName}" to ${targetName} at ${targetSkillDir}.`,
    operation: op,
  };
}

export function uninstallSkill(
  skillName: string,
  targetName: string,
  options: InstallOptions,
): InstallResult {
  const { operationsPath, mappingsPath } = options;

  // 1. Read mapping to find the link for this skill+target
  const mappings = readSkillMappings(mappingsPath);
  const mapping = mappings.mappings[skillName];
  const link = mapping?.links[targetName];

  if (!link) {
    return {
      status: 'not-found',
      skillName,
      targetName,
      linkPath: '',
      message: `No mapping found for "${skillName}" on "${targetName}".`,
    };
  }

  // 2. Validate linkPath belongs to a known target skill directory before deleting
  const allowedRoots: string[] = [];
  if (options.targetSkillRoot) {
    allowedRoots.push(resolve(options.targetSkillRoot));
  }
  const profile = getTargetProfile(targetName, options.targetProfiles);
  if (profile) {
    for (const dir of profile.skillDirs) {
      allowedRoots.push(resolve(dir));
    }
  }
  const resolvedLinkPath = resolve(link.path);
  const expectedLinkPaths = allowedRoots.map((root) => resolve(root, skillName));
  const isExpectedLinkPath = expectedLinkPaths.some(
    (expectedPath) => resolvedLinkPath === expectedPath,
  );
  if (!isExpectedLinkPath) {
    return {
      status: 'not-found',
      skillName,
      targetName,
      linkPath: link.path,
      message: `Refusing to delete "${link.path}": not under a known skill directory for target "${targetName}". Manual cleanup may be needed.`,
    };
  }

  // 3. Remove link if it exists
  if (existsSync(link.path)) {
    rmSync(link.path, { recursive: true, force: true });
  }

  // 4. Remove from mappings
  removeMappingLink(mappingsPath, skillName, targetName);

  // 5. Log operation
  const op = appendOperation(operationsPath, {
    action: 'uninstall',
    skill: skillName,
    target: targetName,
    status: 'completed',
    details: { removedLinkPath: link.path },
  });

  return {
    status: 'installed', // reusing 'installed' as success for uninstall
    skillName,
    targetName,
    linkPath: '',
    message: `Uninstalled "${skillName}" from "${targetName}".`,
    operation: op,
  };
}

export function rollbackLastInstall(
  targetName: string,
  options: InstallOptions,
): InstallResult | null {
  const { operationsPath } = options;
  const ops = readOperations(operationsPath);

  // Find the most recent completed install operation for this target
  const lastInstall = [...ops]
    .reverse()
    .find((op) => op.action === 'install' && op.target === targetName && op.status === 'completed');

  if (!lastInstall) {
    return {
      status: 'not-found',
      skillName: '',
      targetName,
      linkPath: '',
      message: `No install operation found for "${targetName}" to roll back.`,
    };
  }

  // Uninstall the skill
  const result = uninstallSkill(lastInstall.skill, targetName, options);

  // Log rollback operation
  appendOperation(operationsPath, {
    action: 'rollback',
    skill: lastInstall.skill,
    target: targetName,
    status: 'completed',
    details: { rolledBackOperationId: lastInstall.id, uninstallResult: result.message },
  });

  return result;
}
