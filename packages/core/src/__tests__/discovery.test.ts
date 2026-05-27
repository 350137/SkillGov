// Tests for local skill discovery using Codex and Claude user skill directories.
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { discoverSkills } from '../discovery.js';

let tmpDir: string;

beforeEach(() => {
  tmpDir = join(tmpdir(), `skillgov-discovery-${randomUUID()}`);
  mkdirSync(tmpDir, { recursive: true });
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

function createSkill(dir: string, name: string, description = 'test skill'): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, 'SKILL.md'),
    `---\nname: ${name}\ndescription: ${description}\n---\n\n# ${name}\n`,
    'utf-8',
  );
}

describe('discoverSkills', () => {
  it('returns empty array when no skill directories exist', () => {
    const result = discoverSkills({ home: tmpDir });
    expect(result).toEqual([]);
  });

  it('finds codex-user skills', () => {
    createSkill(join(tmpDir, '.codex', 'skills', 'my-skill'), 'my-skill');
    const result = discoverSkills({ home: tmpDir });
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('my-skill');
    expect(result[0].source).toBe('codex-user');
    expect(result[0].sourceLabel).toBe('Codex 技能目录');
    expect(result[0].agentTargets).toEqual(['codex']);
    expect(result[0].validationStatus).toBe('pass');
    expect(result[0].alreadyImported).toBe(false);
  });

  it('finds claude-user skills', () => {
    createSkill(join(tmpDir, '.claude', 'skills', 'claude-skill'), 'claude-skill');
    const result = discoverSkills({ home: tmpDir });
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('claude-skill');
    expect(result[0].source).toBe('claude-user');
    expect(result[0].sourceLabel).toBe('Claude 技能目录');
    expect(result[0].agentTargets).toEqual(['claude']);
  });

  it('ignores codex plugin cache skills', () => {
    const cachePath = join(
      tmpDir,
      '.codex',
      'plugins',
      'cache',
      'openai-curated',
      'superpowers',
      'v1',
      'skills',
      'brainstorming',
    );
    createSkill(cachePath, 'brainstorming');
    const result = discoverSkills({ home: tmpDir });
    expect(result).toEqual([]);
  });

  it('finds skills from both agent skill directories without plugin cache entries', () => {
    createSkill(join(tmpDir, '.codex', 'skills', 'codex-skill'), 'codex-skill');
    createSkill(join(tmpDir, '.claude', 'skills', 'claude-skill'), 'claude-skill');
    const cachePath = join(
      tmpDir,
      '.codex',
      'plugins',
      'cache',
      'org',
      'plugin',
      'v1',
      'skills',
      'cached-skill',
    );
    createSkill(cachePath, 'cached-skill');
    const result = discoverSkills({ home: tmpDir });
    expect(result).toHaveLength(2);
    const sources = result.map((s) => s.source).sort();
    expect(sources).toEqual(['claude-user', 'codex-user']);
  });

  it('marks already-imported skills when registryPath provided', () => {
    createSkill(join(tmpDir, '.codex', 'skills', 'existing-skill'), 'existing-skill');
    const registryPath = join(tmpDir, 'registry', 'skills.json');
    mkdirSync(join(tmpDir, 'registry'), { recursive: true });
    writeFileSync(
      registryPath,
      JSON.stringify({ skills: { 'existing-skill': { name: 'existing-skill' } } }),
      'utf-8',
    );
    const result = discoverSkills({ home: tmpDir, registryPath });
    expect(result[0].alreadyImported).toBe(true);
  });

  it('reports fail status for directories without SKILL.md', () => {
    mkdirSync(join(tmpDir, '.codex', 'skills', 'broken'), { recursive: true });
    writeFileSync(join(tmpDir, '.codex', 'skills', 'broken', 'readme.txt'), 'not a skill', 'utf-8');
    const result = discoverSkills({ home: tmpDir });
    expect(result).toHaveLength(1);
    expect(result[0].validationStatus).toBe('fail');
  });

  it('reports fixable status for skills with warnings', () => {
    const dir = join(tmpDir, '.codex', 'skills', 'mismatch');
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, 'SKILL.md'),
      '---\nname: different-name\ndescription: test\n---\n\n# mismatch\n',
      'utf-8',
    );
    const result = discoverSkills({ home: tmpDir });
    expect(result[0].validationStatus).toBe('fixable');
  });

  it('skips .system directory in codex skills', () => {
    createSkill(join(tmpDir, '.codex', 'skills', '.system', 'internal'), 'internal');
    createSkill(join(tmpDir, '.codex', 'skills', 'real-skill'), 'real-skill');
    const result = discoverSkills({ home: tmpDir });
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('real-skill');
  });
});
