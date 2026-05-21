// CLI entry point for SkillGov — parses subcommands and dispatches to @skillgov/core operations.
import {
  VERSION,
  checkCompatibility,
  generateOverlayTask,
  generateRepairTask,
  importSkill,
  initProject,
  loadConfig,
  validateSkill,
} from '@skillgov/core';

const HELP_TEXT = `skillgov v${VERSION}

Usage: skillgov <command> [options]

Commands:
  init                          Initialize a new SkillGov project
  inventory                     List all skills in the registry
  import <path>                 Import a skill into the incoming review area
  validate <skill>              Run standard Agent Skill validation
  compat <skill> --target <t>   Check compatibility for a target agent
  task repair <skill>           Generate a repair task for a fixable skill
  task overlay <skill> --target <t>  Generate a target overlay task
  install <skill> --target <t>  Install a skill to a target agent
  uninstall <skill> --target <t> Uninstall a skill from a target agent
  status                        Show current project status
  doctor                        Run diagnostics on the project
  rollback <operation-id>       Roll back an install operation

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
      const result = importSkill(sourcePath, { incoming, skills });
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
    const result = checkCompatibility(skillPath, targetName);
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
      const compatResult = checkCompatibility(skillPath, targetName);
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

  console.log(`Unknown command: ${command}`);
  console.log(`Run 'skillgov help' for usage information.`);
  process.exitCode = 1;
}

import { fileURLToPath } from 'node:url';

const entryPath = fileURLToPath(import.meta.url);
if (process.argv[1] === entryPath) {
  main(process.argv.slice(2));
}
