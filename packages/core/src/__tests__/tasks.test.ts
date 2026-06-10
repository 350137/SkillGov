// Tests for repair and overlay task document generation.
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { CompatibilityResult } from '../compat.js';
import { generateOverlayTask, generateRepairTask } from '../tasks.js';
import type { ValidationResult } from '../validator.js';

function norm(p: string): string {
  return p.replace(/\\/g, '/');
}

let tmpDir: string;

beforeEach(() => {
  tmpDir = join(tmpdir(), `skillgov-tasks-${randomUUID()}`);
  mkdirSync(tmpDir, { recursive: true });
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

function createMinimalSkill(name: string): string {
  const dir = join(tmpDir, name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, 'SKILL.md'),
    `---\nname: ${name}\ndescription: test skill\n---\n\nContent.\n`,
    'utf-8',
  );
  return dir;
}

describe('generateRepairTask', () => {
  it('creates repair task file with issues', () => {
    const skillPath = createMinimalSkill('repair-me');
    const validation: ValidationResult = {
      status: 'fixable',
      skillName: 'repair-me',
      issues: [
        { severity: 'warning', message: 'Name does not match directory name.', field: 'name' },
        { severity: 'warning', message: 'Referenced file "missing.md" not found.' },
      ],
    };
    const result = generateRepairTask({ skillPath, validation, projectRoot: tmpDir });
    expect(existsSync(result.taskPath)).toBe(true);
    expect(norm(result.taskPath)).toContain('tasks/repair/repair-me.md');
    expect(result.content).toContain('Repair Task: repair-me');
    expect(result.content).toContain('Name does not match directory name');
    expect(result.content).toContain('missing.md');
    expect(result.content).toContain('skillgov validate');
  });

  it('includes validation and install commands', () => {
    const skillPath = createMinimalSkill('fixable-skill');
    const validation: ValidationResult = {
      status: 'fixable',
      skillName: 'fixable-skill',
      issues: [{ severity: 'warning', message: 'Some issue.' }],
    };
    const result = generateRepairTask({ skillPath, validation, projectRoot: tmpDir });
    expect(result.content).toContain('skillgov validate');
    expect(result.content).toContain('skillgov import');
  });

  it('rejects unsafe skill names instead of writing outside the repair task directory', () => {
    const skillPath = createMinimalSkill('unsafe-repair');
    const validation: ValidationResult = {
      status: 'fixable',
      skillName: '../escape',
      issues: [{ severity: 'warning', message: 'Unsafe name.' }],
    };

    expect(() => generateRepairTask({ skillPath, validation, projectRoot: tmpDir })).toThrow(
      /safe file name/i,
    );
    expect(existsSync(join(tmpDir, 'tasks', 'escape.md'))).toBe(false);
  });
});

describe('generateOverlayTask', () => {
  it('creates overlay task file with compatibility issues', () => {
    const skillPath = createMinimalSkill('claude-only-skill');
    const compatResult: CompatibilityResult = {
      status: 'needs-overlay',
      skillName: 'claude-only-skill',
      targetName: 'codex',
      issues: [
        { severity: 'warning', message: 'Tool "computer" is Claude-specific.', category: 'tool' },
        { severity: 'info', message: 'Markdown references "Claude".', category: 'target' },
      ],
    };
    const result = generateOverlayTask({
      skillPath,
      targetName: 'codex',
      compatResult,
      projectRoot: tmpDir,
    });
    expect(existsSync(result.taskPath)).toBe(true);
    expect(norm(result.taskPath)).toContain('tasks/overlay/codex/claude-only-skill.md');
    expect(result.content).toContain('Overlay Task: claude-only-skill → codex');
    expect(result.content).toContain('Tool "computer" is Claude-specific');
  });

  it('includes output path and install command', () => {
    const skillPath = createMinimalSkill('needs-overlay');
    const compatResult: CompatibilityResult = {
      status: 'needs-overlay',
      skillName: 'needs-overlay',
      targetName: 'claude',
      issues: [{ severity: 'warning', message: 'Test issue.', category: 'dependency' }],
    };
    const result = generateOverlayTask({
      skillPath,
      targetName: 'claude',
      compatResult,
      projectRoot: tmpDir,
    });
    expect(result.content).toContain('skillgov install');
    expect(norm(result.content)).toContain('overlays/claude/needs-overlay');
  });

  it('rejects unsafe overlay task path segments', () => {
    const skillPath = createMinimalSkill('needs-overlay');
    const compatResult: CompatibilityResult = {
      status: 'needs-overlay',
      skillName: 'needs-overlay',
      targetName: '../outside',
      issues: [{ severity: 'warning', message: 'Test issue.', category: 'dependency' }],
    };

    expect(() =>
      generateOverlayTask({
        skillPath,
        targetName: '../outside',
        compatResult,
        projectRoot: tmpDir,
      }),
    ).toThrow(/safe file name/i);
    expect(existsSync(join(tmpDir, 'tasks', 'outside'))).toBe(false);
  });
});
