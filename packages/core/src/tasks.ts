// Repair and overlay task document generator — writes markdown task files for fixable skills or target-specific adaptations.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { CompatibilityResult } from './compat.js';
import { loadConfig } from './config.js';
import { assertSafeFileName } from './names.js';
import type { ValidationResult } from './validator.js';

export interface RepairTaskOptions {
  skillPath: string;
  validation: ValidationResult;
  projectRoot?: string;
}

export interface OverlayTaskOptions {
  skillPath: string;
  targetName: string;
  compatResult: CompatibilityResult;
  projectRoot?: string;
}

export interface TaskResult {
  taskPath: string;
  content: string;
}

function resolveProjectRoot(override?: string): string {
  if (override) return override;
  const config = loadConfig();
  return config.projectRoot;
}

export function generateRepairTask(options: RepairTaskOptions): TaskResult {
  const { skillPath, validation, projectRoot } = options;
  const root = resolveProjectRoot(projectRoot);
  const skillName = validation.skillName || dirname(skillPath).split(/[/\\]/).pop() || 'unknown';
  assertSafeFileName(skillName, 'Skill name');
  const taskDir = resolve(root, 'tasks', 'repair');
  const taskPath = resolve(taskDir, `${skillName}.md`);

  const lines: string[] = [
    `# Repair Task: ${skillName}`,
    '',
    `**Source:** \`${skillPath}\``,
    `**Validation Status:** ${validation.status}`,
    `**Generated:** ${new Date().toISOString()}`,
    '',
    '## Detected Issues',
    '',
  ];

  for (const issue of validation.issues) {
    lines.push(
      `- [${issue.severity}] ${issue.message}${issue.field ? ` (field: \`${issue.field}\`)` : ''}`,
    );
  }

  lines.push(
    '',
    '## Constraints',
    '',
    '- Do not change the skill name or directory structure',
    '- Do not remove required frontmatter fields (name, description)',
    '- Fix only the issues listed above',
    '- Preserve all existing functionality',
    '',
    '## Validation Command',
    '',
    '```bash',
    `skillgov validate "${skillPath}"`,
    '```',
    '',
    '## Install Command (after passing validation)',
    '',
    '```bash',
    `skillgov import "${skillPath}"`,
    '```',
    '',
  );

  if (!existsSync(taskDir)) {
    mkdirSync(taskDir, { recursive: true });
  }
  writeFileSync(taskPath, lines.join('\n'), 'utf-8');

  return { taskPath, content: lines.join('\n') };
}

export function generateOverlayTask(options: OverlayTaskOptions): TaskResult {
  const { skillPath, targetName, compatResult, projectRoot } = options;
  const root = resolveProjectRoot(projectRoot);
  const skillName = compatResult.skillName || dirname(skillPath).split(/[/\\]/).pop() || 'unknown';
  assertSafeFileName(skillName, 'Skill name');
  assertSafeFileName(targetName, 'Target name');
  const taskDir = resolve(root, 'tasks', 'overlay', targetName);
  const taskPath = resolve(taskDir, `${skillName}.md`);

  const lines: string[] = [
    `# Overlay Task: ${skillName} → ${targetName}`,
    '',
    `**Source:** \`${skillPath}\``,
    `**Target:** ${targetName}`,
    `**Compatibility Status:** ${compatResult.status}`,
    `**Generated:** ${new Date().toISOString()}`,
    '',
    '## Detected Compatibility Issues',
    '',
  ];

  for (const issue of compatResult.issues) {
    lines.push(`- [${issue.severity}] [${issue.category}] ${issue.message}`);
  }

  lines.push(
    '',
    '## Constraints',
    '',
    '- Do not change the skill name or directory structure',
    '- Do not modify the original skill files',
    '- Create target-specific adaptations only for the issues listed above',
    '- Preserve all existing functionality',
    '',
    '## Output Path',
    '',
    '`````text',
    `${resolve(root, 'overlays', targetName, skillName)}`,
    '```',
    '',
    '## Validation Command',
    '',
    '```bash',
    `skillgov validate "${resolve(root, 'overlays', targetName, skillName)}"`,
    '```',
    '',
    '## Install Command (after overlay is complete)',
    '',
    '```bash',
    `skillgov install "${skillName}" --target ${targetName}`,
    '```',
    '',
  );

  if (!existsSync(taskDir)) {
    mkdirSync(taskDir, { recursive: true });
  }
  writeFileSync(taskPath, lines.join('\n'), 'utf-8');

  return { taskPath, content: lines.join('\n') };
}
