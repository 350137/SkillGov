// Tests for standard Agent Skill validator — name, description, references, and path safety.
import { randomUUID } from 'node:crypto';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// Tests for standard Agent Skill validation — checks structure, frontmatter, name, description, references, and path safety.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type ValidationResult, validateSkill } from '../validator.js';

let tmpDir: string;

beforeEach(() => {
  tmpDir = join(tmpdir(), `skillgov-val-${randomUUID()}`);
  mkdirSync(tmpDir, { recursive: true });
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

function createSkill(
  skillDirName: string,
  customName?: string,
  overrides: Record<string, string> = {},
) {
  const dir = join(tmpDir, skillDirName);
  mkdirSync(dir, { recursive: true });

  const name = customName ?? skillDirName;
  const fm: Record<string, string> = { name, description: 'a test skill', ...overrides };
  const lines = Object.entries(fm)
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n');

  writeFileSync(
    join(dir, 'SKILL.md'),
    `---\n${lines}\n---\n\n# ${name}\n\nContent here.\n`,
    'utf-8',
  );

  return dir;
}

describe('validateSkill', () => {
  it('passes a valid basic skill', () => {
    const dir = createSkill('valid-basic');
    const result = validateSkill(dir);
    expect(result.status).toBe('pass');
  });

  it('fails when SKILL.md does not exist', () => {
    const dir = join(tmpDir, 'no-skill-md');
    mkdirSync(dir, { recursive: true });
    const result = validateSkill(dir);
    expect(result.status).toBe('fail');
    expect(result.issues.some((i) => i.message.toLowerCase().includes('skill.md'))).toBe(true);
  });

  it('fails when frontmatter is invalid', () => {
    const dir = join(tmpDir, 'invalid-yaml');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'SKILL.md'), '---\n: bad key\n---\n', 'utf-8');
    const result = validateSkill(dir);
    expect(result.status).toBe('fail');
    expect(result.issues.length).toBeGreaterThan(0);
  });

  it('fails when name is missing', () => {
    const dir = join(tmpDir, 'missing-name');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'SKILL.md'), '---\ndescription: no name here\n---\n', 'utf-8');
    const result = validateSkill(dir);
    expect(result.status).toBe('fail');
    expect(result.issues.some((i) => i.field === 'name')).toBe(true);
  });

  it('fails when description is missing', () => {
    const dir = join(tmpDir, 'missing-desc');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'SKILL.md'), '---\nname: missing-desc\n---\n', 'utf-8');
    const result = validateSkill(dir);
    expect(result.status).toBe('fail');
    expect(result.issues.some((i) => i.field === 'description')).toBe(true);
  });

  it('warns when skill name does not match directory name', () => {
    const dir = createSkill('some-dir-name', 'different-skill-name');
    const result = validateSkill(dir);
    expect(result.status).toBe('fixable');
    expect(
      result.issues.some(
        (i) =>
          i.message.toLowerCase().includes('name') && i.message.toLowerCase().includes('directory'),
      ),
    ).toBe(true);
  });

  it('warns when SKILL.md references a non-existent file', () => {
    const dir = join(tmpDir, 'broken-ref');
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, 'SKILL.md'),
      '---\nname: broken-ref\ndescription: has references\n---\n\nSee [details](missing-file.md).\n',
      'utf-8',
    );
    const result = validateSkill(dir);
    expect(result.status).toBe('fixable');
    expect(result.issues.some((i) => i.message.toLowerCase().includes('reference'))).toBe(true);
  });

  it('reports dangerous absolute paths', () => {
    const dir = join(tmpDir, 'dangerous-path');
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, 'SKILL.md'),
      '---\nname: dangerous-path\ndescription: has absolute paths\n---\n\nRun: C:/Windows/system32/cmd.exe\nAlso: /usr/bin/rm\n',
      'utf-8',
    );
    const result = validateSkill(dir);
    expect(result.status).toBe('fixable');
    expect(result.issues.some((i) => i.message.toLowerCase().includes('absolute'))).toBe(true);
  });

  it('passes a skill with assets', () => {
    const dir = createSkill('skill-with-assets');
    writeFileSync(join(dir, 'icon.png'), 'fake-png-data', 'utf-8');
    writeFileSync(join(dir, 'config.json'), '{}', 'utf-8');
    const result = validateSkill(dir);
    expect(result.status).toBe('pass');
  });

  it('passes a skill with scripts', () => {
    const dir = createSkill('skill-with-scripts');
    const scriptsDir = join(dir, 'scripts');
    mkdirSync(scriptsDir, { recursive: true });
    writeFileSync(join(scriptsDir, 'run.sh'), 'echo hello', 'utf-8');
    writeFileSync(join(scriptsDir, 'setup.py'), 'print("hello")', 'utf-8');
    const result = validateSkill(dir);
    expect(result.status).toBe('pass');
  });
});
