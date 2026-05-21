// Skill import flow — copies external skill into incoming, validates, and promotes passing skills into the skills directory with registry updates.
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { hashDirectory } from './hash.js';
import { type SkillsRegistry, readRegistry, writeRegistry } from './registry.js';
import { validateSkill } from './validator.js';

export interface ImportOptions {
  incoming: string;
  skills: string;
  origin?: string;
  registryPath?: string;
}

export interface ImportResult {
  status: 'pass' | 'fixable' | 'fail';
  skillName: string;
  issues: string[];
  origin?: string;
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

export function importSkill(sourcePath: string, options: ImportOptions): ImportResult {
  const resolvedSource = resolve(sourcePath);

  if (!existsSync(resolvedSource)) {
    throw new Error(`Source path does not exist: "${resolvedSource}"`);
  }

  const skillName = basename(resolvedSource);
  const { incoming, skills, origin, registryPath } = options;

  // 1. Copy to incoming/<skill>
  const incomingDir = resolve(incoming);
  const incomingSkillDir = resolve(incomingDir, skillName);
  mkdirSync(incomingDir, { recursive: true });
  copyDir(resolvedSource, incomingSkillDir);

  // 2. Validate
  const validation = validateSkill(incomingSkillDir);

  if (validation.status === 'fail') {
    // Remove failed import from incoming
    rmSync(incomingSkillDir, { recursive: true, force: true });
    return {
      status: 'fail',
      skillName,
      issues: validation.issues.map((i) => i.message),
      origin,
    };
  }

  if (validation.status === 'fixable') {
    return {
      status: 'fixable',
      skillName,
      issues: validation.issues.map((i) => i.message),
      origin,
    };
  }

  // 3. Promote to skills/
  const skillsDir = resolve(skills);
  const skillsSkillDir = resolve(skillsDir, skillName);
  mkdirSync(skillsDir, { recursive: true });

  // Move from incoming to skills
  copyDir(incomingSkillDir, skillsSkillDir);
  rmSync(incomingSkillDir, { recursive: true, force: true });

  // 4. Update registry
  if (registryPath) {
    const fileHash = hashDirectory(skillsSkillDir);
    const registry = readRegistry<SkillsRegistry>(registryPath, { skills: {} });
    if (!registry.skills[skillName]) {
      registry.skills[skillName] = {
        name: skillName,
        sourcePath: resolvedSource,
        origin: origin || 'local',
        fileHash,
        importedAt: new Date().toISOString(),
        validationStatus: 'pass',
      };
      writeRegistry(registryPath, registry);
    }
  }

  return { status: 'pass', skillName, issues: [], origin };
}
