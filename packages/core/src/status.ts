// Project status reporter — aggregates skill inventory, install state, and registry info into a structured report.
import { existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { discoverSkills } from './discovery.js';
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

export interface ProjectStatusOptions {
  home?: string;
}

export function getProjectStatus(
  projectRoot: string,
  options: ProjectStatusOptions = {},
): ProjectStatus {
  const overlaysDir = resolve(projectRoot, 'overlays');
  const registryPath = resolve(projectRoot, 'registry', 'skills.json');
  const installsPath = resolve(projectRoot, 'registry', 'installs.json');
  const discovered = discoverSkills({
    home: options.home,
    projectRoot,
    registryPath,
    installsPath,
  });
  const visibleSkillNames = new Set(discovered.map((skill) => skill.name));

  // Read installs registry once for target aggregation
  const installsReg = readRegistry<InstallsRegistry>(installsPath, { installs: {} });
  const installedBySkill = new Map<string, string[]>();
  for (const record of Object.values(installsReg.installs)) {
    if (!visibleSkillNames.has(record.skillName)) continue;
    const targets = installedBySkill.get(record.skillName) || [];
    targets.push(record.target);
    installedBySkill.set(record.skillName, targets);
  }

  // Discover overlay targets
  const skills: SkillStatus[] = discovered.map((skill) => {
    const overlayTargets: string[] = [];
    if (existsSync(overlaysDir)) {
      const targets = readdirSync(overlaysDir);
      for (const target of targets) {
        if (existsSync(resolve(overlaysDir, target, skill.name))) {
          overlayTargets.push(target);
        }
      }
    }
    return {
      name: skill.name,
      hasOverlay: overlayTargets.length > 0,
      overlayTargets,
      installedTargets:
        skill.agentTargets.length > 0 ? skill.agentTargets : installedBySkill.get(skill.name) || [],
    };
  });

  // Collect installs list
  const installs = Object.values(installsReg.installs)
    .filter((r) => visibleSkillNames.has(r.skillName))
    .map((r) => ({
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
