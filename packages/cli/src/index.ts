// CLI entry point for SkillGov — parses subcommands and dispatches to @skillgov/core operations.
import {
  VERSION,
  checkCompatibility,
  discoverSkills,
  generateOverlayTask,
  generateRepairTask,
  getProjectStatus,
  importSkill,
  initProject,
  installSkill,
  listTargetProfiles,
  loadConfig,
  readRegistry,
  rollbackLastInstall,
  runDoctor,
  uninstallSkill,
  validateSkill,
} from '@skillgov/core';
import type { SkillsRegistry } from '@skillgov/core';

const HELP_TEXT = `skillgov v${VERSION}

Usage: skillgov <command> [options]

Commands:
  init                          Initialize a new SkillGov project
  inventory                     List all skills in the registry
  import <path>                 Import a skill into the incoming review area
  discover [--import]           Scan local machine for existing skills
  validate <skill>              Run standard Agent Skill validation
  compat <skill> --target <t>   Check compatibility for a target agent
  task repair <skill>           Generate a repair task for a fixable skill
  task overlay <skill> --target <t>  Generate a target overlay task
  install <skill> --target <t>  Install a skill to a target agent
  uninstall <skill> --target <t> Uninstall a skill from a target agent
  status                        Show current project status
  doctor                        Run diagnostics on the project
  rollback --target <target>    Roll back the last install for a target

Target agents: claude, codex
`;

export function main(args: string[]): void {
  if (args.length === 0 || args[0] === 'help' || args[0] === '--help' || args[0] === '-h') {
    console.log(HELP_TEXT);
    return;
  }

  const command = args[0];

  if (command === 'version' || command === '--version' || command === '-v') {
    console.log(`skillgov v${VERSION}`);
    return;
  }

  if (command === 'init') {
    const root = process.cwd();
    initProject(root);
    console.log(`Initialised SkillGov project at ${root}`);
    return;
  }

  if (command === 'inventory') {
    const config = loadConfig();
    const registryPath = `${config.projectRoot}/registry/skills.json`;
    const registry = readRegistry<SkillsRegistry>(registryPath, { skills: {} });
    const entries = Object.values(registry.skills);
    console.log(`Skills registry: ${registryPath}`);
    if (entries.length === 0) {
      console.log('  (empty)');
      return;
    }
    for (const entry of entries) {
      console.log(`  - ${entry.name}`);
      console.log(`      origin: ${entry.origin}`);
      console.log(`      status: ${entry.validationStatus}`);
      console.log(`      imported: ${entry.importedAt}`);
    }
    return;
  }

  if (command === 'discover') {
    const doImport = args.includes('--import');
    const config = loadConfig();
    const registryPath = `${config.projectRoot}/registry/skills.json`;
    const discovered = discoverSkills({
      projectRoot: config.projectRoot,
      registryPath,
      installsPath: `${config.projectRoot}/registry/installs.json`,
    });

    if (discovered.length === 0) {
      console.log('No local skills found.');
      return;
    }

    console.log(`Found ${discovered.length} local skill(s):\n`);
    for (const skill of discovered) {
      const imported = skill.alreadyImported ? ' [already imported]' : '';
      console.log(`  - ${skill.name} (${skill.source}) — ${skill.validationStatus}${imported}`);
      console.log(`      path: ${skill.path}`);
      for (const issue of skill.issues) {
        console.log(`      issue: ${issue}`);
      }
    }

    if (doImport) {
      const incoming = `${config.projectRoot}/incoming`;
      const skills = `${config.projectRoot}/skills`;
      const passSkills = discovered.filter(
        (s) => s.validationStatus === 'pass' && !s.alreadyImported,
      );

      if (passSkills.length === 0) {
        console.log('\nNo new skills to import (all already imported or failed validation).');
        return;
      }

      console.log(`\nImporting ${passSkills.length} passing skill(s)...`);
      for (const skill of passSkills) {
        try {
          const result = importSkill(skill.path, {
            incoming,
            skills,
            registryPath,
            origin: skill.source,
          });
          console.log(`  ✓ ${result.skillName} — ${result.status}`);
        } catch (err) {
          console.log(`  ✗ ${skill.name} — error: ${(err as Error).message}`);
        }
      }
    }

    return;
  }

  if (command === 'validate') {
    const skillPath = args[1];
    if (!skillPath) {
      console.log('Usage: skillgov validate <path>');
      process.exitCode = 1;
      return;
    }
    const result = validateSkill(skillPath);
    console.log(`Validation result: ${result.status}`);
    if (result.skillName) console.log(`  Skill name: ${result.skillName}`);
    for (const issue of result.issues) {
      console.log(`  [${issue.severity}] ${issue.message}`);
    }
    if (result.status !== 'pass') process.exitCode = 1;
    return;
  }

  if (command === 'import') {
    const sourcePath = args[1];
    if (!sourcePath) {
      console.log('Usage: skillgov import <path>');
      process.exitCode = 1;
      return;
    }
    const root = process.cwd();
    const config = loadConfig();
    const incoming = `${config.projectRoot}/incoming`;
    const skills = `${config.projectRoot}/skills`;

    try {
      const result = importSkill(sourcePath, {
        incoming,
        skills,
        registryPath: `${config.projectRoot}/registry/skills.json`,
      });
      if (result.status === 'pass') {
        console.log(`Imported "${result.skillName}" — validation passed`);
      } else if (result.status === 'fixable') {
        console.log(`Imported "${result.skillName}" — needs fixes`);
        for (const issue of result.issues) {
          console.log(`  [fixable] ${issue}`);
        }
      } else {
        console.log(`Failed to import "${result.skillName}" — validation failed`);
        for (const issue of result.issues) {
          console.log(`  [error] ${issue}`);
        }
      }
    } catch (err) {
      console.error(`Import error: ${(err as Error).message}`);
      process.exitCode = 1;
    }
    return;
  }

  if (command === 'compat') {
    const skillPath = args[1];
    const targetIndex = args.indexOf('--target');
    const targetName =
      targetIndex !== -1 && args[targetIndex + 1] ? args[targetIndex + 1] : undefined;
    if (!skillPath || !targetName) {
      console.log('Usage: skillgov compat <skill> --target <target>');
      process.exitCode = 1;
      return;
    }
    const config = loadConfig();
    const result = checkCompatibility(skillPath, targetName, {
      targetProfiles: listTargetProfiles(config.targets),
      mappingsPath: `${config.projectRoot}/registry/mappings.json`,
    });
    console.log(`Compatibility result: ${result.status}`);
    console.log(`  Skill: ${result.skillName}`);
    console.log(`  Target: ${result.targetName}`);
    for (const issue of result.issues) {
      console.log(`  [${issue.severity}] [${issue.category}] ${issue.message}`);
    }
    if (result.status !== 'compatible') process.exitCode = 1;
    return;
  }

  if (command === 'task') {
    const subcommand = args[1];
    const skillPath = args[2];

    if (subcommand === 'repair') {
      if (!skillPath) {
        console.log('Usage: skillgov task repair <skill>');
        process.exitCode = 1;
        return;
      }
      const validation = validateSkill(skillPath);
      if (validation.status !== 'fixable') {
        console.log(
          `Skill "${validation.skillName || skillPath}" status is "${validation.status}". Repair task requires "fixable" status.`,
        );
        process.exitCode = 1;
        return;
      }
      const result = generateRepairTask({ skillPath, validation });
      console.log(`Repair task written to: ${result.taskPath}`);
      return;
    }

    if (subcommand === 'overlay') {
      const targetIndex = args.indexOf('--target');
      const targetName =
        targetIndex !== -1 && args[targetIndex + 1] ? args[targetIndex + 1] : undefined;
      if (!skillPath || !targetName) {
        console.log('Usage: skillgov task overlay <skill> --target <target>');
        process.exitCode = 1;
        return;
      }
      const config = loadConfig();
      const compatResult = checkCompatibility(skillPath, targetName, {
        targetProfiles: listTargetProfiles(config.targets),
        mappingsPath: `${config.projectRoot}/registry/mappings.json`,
      });
      if (compatResult.status !== 'needs-overlay') {
        console.log(
          `Skill "${compatResult.skillName}" on "${targetName}" is "${compatResult.status}". Overlay task requires "needs-overlay" status.`,
        );
        process.exitCode = 1;
        return;
      }
      const result = generateOverlayTask({ skillPath, targetName, compatResult });
      console.log(`Overlay task written to: ${result.taskPath}`);
      return;
    }

    console.log('Usage: skillgov task repair <skill> | skillgov task overlay <skill> --target <t>');
    process.exitCode = 1;
    return;
  }

  if (command === 'install') {
    const skillName = args[1];
    const targetIndex = args.indexOf('--target');
    const targetName =
      targetIndex !== -1 && args[targetIndex + 1] ? args[targetIndex + 1] : undefined;
    if (!skillName || !targetName) {
      console.log('Usage: skillgov install <skill> --target <target>');
      process.exitCode = 1;
      return;
    }
    const root = process.cwd();
    const config = loadConfig();
    const result = installSkill(skillName, targetName, config.defaultLinkMode, {
      projectRoot: config.projectRoot,
      operationsPath: `${config.projectRoot}/registry/operations.jsonl`,
      mappingsPath: `${config.projectRoot}/registry/mappings.json`,
      targetProfiles: listTargetProfiles(config.targets),
    });
    console.log(result.message);
    if (result.status !== 'installed') process.exitCode = 1;
    return;
  }

  if (command === 'uninstall') {
    const skillName = args[1];
    const targetIndex = args.indexOf('--target');
    const targetName =
      targetIndex !== -1 && args[targetIndex + 1] ? args[targetIndex + 1] : undefined;
    if (!skillName || !targetName) {
      console.log('Usage: skillgov uninstall <skill> --target <target>');
      process.exitCode = 1;
      return;
    }
    const root = process.cwd();
    const config = loadConfig();
    const result = uninstallSkill(skillName, targetName, {
      projectRoot: config.projectRoot,
      operationsPath: `${config.projectRoot}/registry/operations.jsonl`,
      mappingsPath: `${config.projectRoot}/registry/mappings.json`,
      targetProfiles: listTargetProfiles(config.targets),
    });
    console.log(result.message);
    if (result.status === 'not-found') process.exitCode = 1;
    return;
  }

  if (command === 'status') {
    const root = process.cwd();
    const config = loadConfig();
    const status = getProjectStatus(config.projectRoot);
    console.log(`SkillGov project at: ${status.projectRoot}`);
    console.log(`\nSkills (${status.skills.length}):`);
    for (const skill of status.skills) {
      const overlay = skill.hasOverlay ? ` [overlays: ${skill.overlayTargets.join(', ')}]` : '';
      console.log(`  - ${skill.name}${overlay}`);
    }
    console.log(`\nInstalls (${status.installs.length}):`);
    for (const inst of status.installs) {
      console.log(`  - ${inst.skillName} → ${inst.target} (${inst.type}, ${inst.installedAt})`);
    }
    console.log(`\nRegistry entries: ${status.registryEntries}`);
    return;
  }

  if (command === 'doctor') {
    const root = process.cwd();
    const config = loadConfig();
    const report = runDoctor(config.projectRoot);
    console.log(`Doctor report for: ${config.projectRoot}`);
    if (report.issues.length === 0) {
      console.log('  No issues found.');
    }
    for (const issue of report.issues) {
      console.log(`  [${issue.severity}] [${issue.category}] ${issue.message}`);
    }
    console.log(`\nStatus: ${report.healthy ? 'HEALTHY' : 'ISSUES FOUND'}`);
    if (!report.healthy) process.exitCode = 1;
    return;
  }

  if (command === 'rollback') {
    const targetIndex = args.indexOf('--target');
    const targetName =
      targetIndex !== -1 && args[targetIndex + 1] ? args[targetIndex + 1] : undefined;
    if (!targetName) {
      console.log('Usage: skillgov rollback --target <target>');
      process.exitCode = 1;
      return;
    }
    const config = loadConfig();
    const result = rollbackLastInstall(targetName, {
      projectRoot: config.projectRoot,
      operationsPath: `${config.projectRoot}/registry/operations.jsonl`,
      mappingsPath: `${config.projectRoot}/registry/mappings.json`,
    });
    if (result && result.status === 'not-found') {
      console.log(result.message);
      process.exitCode = 1;
    } else if (result) {
      console.log(`Rolled back: ${result.message}`);
    }
    return;
  }

  console.log(`Unknown command: ${command}`);
  console.log(`Run 'skillgov help' for usage information.`);
  process.exitCode = 1;
}

import { fileURLToPath } from 'node:url';

const entryPath = fileURLToPath(import.meta.url);
if (process.argv[1] === entryPath) {
  main(process.argv.slice(2));
}
