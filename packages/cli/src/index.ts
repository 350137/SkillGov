// CLI entry point for SkillGov — parses subcommands and dispatches to @skillgov/core operations.
import { VERSION, initProject } from '@skillgov/core';

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

  console.log(`Unknown command: ${command}`);
  console.log(`Run 'skillgov help' for usage information.`);
  process.exitCode = 1;
}

import { fileURLToPath } from 'node:url';

const entryPath = fileURLToPath(import.meta.url);
if (process.argv[1] === entryPath) {
  main(process.argv.slice(2));
}
