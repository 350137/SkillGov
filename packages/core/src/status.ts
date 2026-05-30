// Project status reporter — aggregates skill inventory, install state, and registry info into a structured report.
import { existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { discoverSkillInventory } from './discovery.js';
import type { NonSkillDirectory } from './discovery.js';
import { readSkillMappings } from './mapping.js';
import { readRegistry } from './registry.js';
import type { SkillsRegistry } from './registry.js';

export interface SkillStatus {
  name: string;
  hasOverlay: boolean;
  overlayTargets: string[];
  installedTargets: string[];
}

export interface ProjectStatus {
  projectRoot: string;
  skills: SkillStatus[];
  nonSkillDirectories: NonSkillDirectory[];
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
  const mappingsPath = resolve(projectRoot, 'registry', 'mappings.json');
  const inventory = discoverSkillInventory({
    home: options.home,
    projectRoot,
    registryPath,
  });
  const discovered = inventory.skills;
  const visibleSkillNames = new Set(discovered.map((skill) => skill.name));

  // Read mappings registry for target aggregation
  const mappingsReg = readSkillMappings(mappingsPath);
  const installedBySkill = new Map<string, string[]>();
  const installsList: Array<{
    skillName: string;
    target: string;
    installedAt: string;
    type: string;
  }> = [];
  for (const [skillName, mapping] of Object.entries(mappingsReg.mappings)) {
    if (!visibleSkillNames.has(skillName)) continue;
    for (const [target, link] of Object.entries(mapping.links)) {
      if (!link) continue;
      const targets = installedBySkill.get(skillName) || [];
      targets.push(target);
      installedBySkill.set(skillName, targets);
      installsList.push({
        skillName,
        target,
        installedAt: link.linkedAt || link.updatedAt,
        type: link.type || 'standard',
      });
    }
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
        skill.appliedAgents.length > 0
          ? skill.appliedAgents.map((a) => a.id)
          : skill.agentTargets.length > 0
            ? skill.agentTargets
            : installedBySkill.get(skill.name) || [],
    };
  });

  // Count registry entries
  const skillsReg = readRegistry<SkillsRegistry>(registryPath, { skills: {} });
  const registryEntries = Object.keys(skillsReg.skills).length;

  return {
    projectRoot,
    skills,
    nonSkillDirectories: inventory.nonSkillDirectories,
    installs: installsList,
    registryEntries,
  };
}
