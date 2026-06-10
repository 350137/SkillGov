// Tests for skill import flow — copies external skill into incoming, validates, and promotes.
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// Tests for skill import flow — copies external skill into incoming, validates, and promotes to skills directory.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type SkillGovConfig, loadConfig, writeConfig } from '../config.js';
import { importSkill } from '../import.js';
import { type SkillsRegistry, readRegistry } from '../registry.js';

let tmpDir: string;

beforeEach(() => {
  tmpDir = join(tmpdir(), `skillgov-import-${randomUUID()}`);
  mkdirSync(tmpDir, { recursive: true });
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

function createSourceSkill(name: string, overrides: Record<string, string> = {}): string {
  const dir = join(tmpDir, 'source', name);
  mkdirSync(dir, { recursive: true });

  const fm: Record<string, string> = { name, description: 'a test skill', ...overrides };
  const lines = Object.entries(fm)
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n');
  writeFileSync(
    join(dir, 'SKILL.md'),
    `---\n${lines}\n---\n\n# ${name}\n\nTest content.\n`,
    'utf-8',
  );
  writeFileSync(join(dir, 'helper.sh'), 'echo ok', 'utf-8');
  return dir;
}

function createProjectDirs(): {
  incoming: string;
  skills: string;
  registry: string;
  config: SkillGovConfig;
} {
  const incoming = join(tmpDir, 'project', 'incoming');
  const skills = join(tmpDir, 'project', 'skills');
  const registry = join(tmpDir, 'project', 'registry');
  mkdirSync(incoming, { recursive: true });
  mkdirSync(skills, { recursive: true });
  mkdirSync(registry, { recursive: true });
  const config: SkillGovConfig = {
    projectRoot: join(tmpDir, 'project'),
    defaultLinkMode: 'junction',
    targets: ['claude'],
  };
  return { incoming, skills, registry, config };
}

describe('importSkill', () => {
  it('copies a valid skill into incoming then promotes to skills', () => {
    const source = createSourceSkill('test-skill');
    const { incoming, skills } = createProjectDirs();
    const result = importSkill(source, { incoming, skills });
    expect(result.status).toBe('pass');
    expect(result.skillName).toBe('test-skill');
    expect(existsSync(join(incoming, 'test-skill'))).toBe(false);
    expect(existsSync(join(skills, 'test-skill', 'SKILL.md'))).toBe(true);
  });

  it('promotes a passing skill to skills directory with all files', () => {
    const source = createSourceSkill('promoted-skill');
    const { incoming, skills } = createProjectDirs();
    const result = importSkill(source, { incoming, skills });
    expect(result.status).toBe('pass');
    expect(existsSync(join(incoming, 'promoted-skill'))).toBe(false);
    expect(existsSync(join(skills, 'promoted-skill', 'SKILL.md'))).toBe(true);
    expect(existsSync(join(skills, 'promoted-skill', 'helper.sh'))).toBe(true);
  });

  it('rejects a skill missing SKILL.md', () => {
    const source = join(tmpDir, 'source', 'broken');
    mkdirSync(source, { recursive: true });
    writeFileSync(join(source, 'random.txt'), 'not a skill', 'utf-8');
    const { incoming, skills } = createProjectDirs();
    const result = importSkill(source, { incoming, skills });
    expect(result.status).toBe('fail');
    expect(existsSync(join(incoming, 'broken'))).toBe(false);
  });

  it('rejects a skill with missing name', () => {
    const source = join(tmpDir, 'source', 'noname');
    mkdirSync(source, { recursive: true });
    writeFileSync(join(source, 'SKILL.md'), '---\ndescription: no name\n---\n', 'utf-8');
    const { incoming, skills } = createProjectDirs();
    const result = importSkill(source, { incoming, skills });
    expect(result.status).toBe('fail');
  });

  it('copies skill files preserving binary content', () => {
    const source = createSourceSkill('binary-test');
    const iconPath = join(source, 'icon.png');
    writeFileSync(iconPath, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    const { incoming, skills } = createProjectDirs();
    const result = importSkill(source, { incoming, skills });
    expect(result.status).toBe('pass');
    const copiedIcon = readFileSync(join(skills, 'binary-test', 'icon.png'));
    expect(copiedIcon[0]).toBe(0x89);
  });

  it('refuses to import skills that contain symlinked directories', () => {
    const source = createSourceSkill('linked-source');
    const external = join(tmpDir, 'external-secret');
    mkdirSync(external, { recursive: true });
    writeFileSync(join(external, 'secret.txt'), 'do not import', 'utf-8');
    symlinkSync(external, join(source, 'external'), 'junction');
    const { incoming, skills } = createProjectDirs();

    expect(() => importSkill(source, { incoming, skills })).toThrow(/symbolic link|junction/i);
    expect(existsSync(join(skills, 'linked-source', 'external', 'secret.txt'))).toBe(false);
  });

  it('fixable skill is placed in incoming and not promoted', () => {
    const source = createSourceSkill('name-mismatch', { name: 'wrong-name' });
    const { incoming, skills } = createProjectDirs();
    const result = importSkill(source, { incoming, skills });
    expect(result.status).toBe('fixable');
    expect(existsSync(join(incoming, 'name-mismatch', 'SKILL.md'))).toBe(true);
    expect(existsSync(join(skills, 'name-mismatch'))).toBe(false);
  });

  it('returns error for non-existent source path', () => {
    const { incoming, skills } = createProjectDirs();
    expect(() => importSkill(join(tmpDir, 'nonexistent'), { incoming, skills })).toThrow();
  });

  it('preserves origin when specified', () => {
    const source = createSourceSkill('origin-test');
    const { incoming, skills } = createProjectDirs();
    const result = importSkill(source, {
      incoming,
      skills,
      origin: 'https://github.com/test/test.git',
    });
    expect(result.origin).toBe('https://github.com/test/test.git');
  });

  it('creates incoming directory if it does not exist', () => {
    const source = createSourceSkill('auto-incoming');
    const incoming = join(tmpDir, 'project', 'incoming');
    const skills = join(tmpDir, 'project', 'skills');
    // Don't create incoming dir
    const result = importSkill(source, { incoming, skills });
    expect(result.status).toBe('pass');
    expect(existsSync(incoming)).toBe(true);
  });

  it('re-importing a skill replaces old files and updates registry', () => {
    const source = createSourceSkill('reimport-skill');
    const { incoming, skills, registry } = createProjectDirs();
    const registryPath = join(registry, 'skills.json');

    // First import
    const result1 = importSkill(source, { incoming, skills, registryPath, origin: 'v1' });
    expect(result1.status).toBe('pass');
    expect(existsSync(join(skills, 'reimport-skill', 'helper.sh'))).toBe(true);

    // Modify source: remove helper.sh, add new file
    rmSync(join(source, 'helper.sh'), { force: true });
    writeFileSync(join(source, 'extra.txt'), 'new content', 'utf-8');

    // Re-import
    const result2 = importSkill(source, { incoming, skills, registryPath, origin: 'v2' });
    expect(result2.status).toBe('pass');

    // Old file should be gone, new file should exist
    expect(existsSync(join(skills, 'reimport-skill', 'helper.sh'))).toBe(false);
    expect(existsSync(join(skills, 'reimport-skill', 'extra.txt'))).toBe(true);

    // Registry should be updated with new origin
    const reg = readRegistry<SkillsRegistry>(registryPath, { skills: {} });
    expect(reg.skills['reimport-skill'].origin).toBe('v2');
  });
});
