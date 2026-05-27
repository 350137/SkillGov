// Project status reporter — aggregates skill inventory, install state, and registry info into a structured report.
import { existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { readRegistry } from './registry.js';
import type { InstallsRegistry, SkillsRegistry } from './registry.js';

export interface SkillStatus {
  name: string;
  hasOverlay: boolean;
  overlayTargets: string[];
  installedTargets: string[];
}

export interface ProjectStatus {
  projectRoot: string;
  skills: SkillStatus[];
  installs: Array<{ skillName: string; target: string; installedAt: string; type: string }>;
  registryEntries: number;
}

export function getProjectStatus(projectRoot: string): ProjectStatus {
  const skillsDir = resolve(projectRoot, 'skills');
  const overlaysDir = resolve(projectRoot, 'overlays');
  const registryPath = resolve(projectRoot, 'registry', 'skills.json');
  const installsPath = resolve(projectRoot, 'registry', 'installs.json');

  // Discover skills from filesystem
  const skillNames: string[] = [];
  if (existsSync(skillsDir)) {
    const entries = readdirSync(skillsDir);
    for (const entry of entries) {
      const skillDir = resolve(skillsDir, entry);
      if (existsSync(resolve(skillDir, 'SKILL.md'))) {
        skillNames.push(entry);
      }
    }
  }

  // Read installs registry once for target aggregation
  const installsReg = readRegistry<InstallsRegistry>(installsPath, { installs: {} });
  const installedBySkill = new Map<string, string[]>();
  for (const record of Object.values(installsReg.installs)) {
    const targets = installedBySkill.get(record.skillName) || [];
    targets.push(record.target);
    installedBySkill.set(record.skillName, targets);
  }

  // Discover overlay targets
  const skills: SkillStatus[] = skillNames.map((name) => {
    const overlayTargets: string[] = [];
    if (existsSync(overlaysDir)) {
      const targets = readdirSync(overlaysDir);
      for (const target of targets) {
        if (existsSync(resolve(overlaysDir, target, name))) {
          overlayTargets.push(target);
        }
      }
    }
    return {
      name,
      hasOverlay: overlayTargets.length > 0,
      overlayTargets,
      installedTargets: installedBySkill.get(name) || [],
    };
  });

  // Collect installs list
  const installs = Object.values(installsReg.installs).map((r) => ({
    skillName: r.skillName,
    target: r.target,
    installedAt: r.installedAt,
    type: r.type,
  }));

  // Count registry entries
  const skillsReg = readRegistry<SkillsRegistry>(registryPath, { skills: {} });
  const registryEntries = Object.keys(skillsReg.skills).length;

  return { projectRoot, skills, installs, registryEntries };
}
