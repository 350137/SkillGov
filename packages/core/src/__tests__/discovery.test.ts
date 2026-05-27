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
    expect(result[0].sourceLabel).toBe('Codex 本地');
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
    expect(result[0].sourceLabel).toBe('Claude 本地');
    expect(result[0].agentTargets).toEqual(['claude']);
  });

  it('finds project skills from all origins and ignores non-skill project folders', () => {
    createSkill(join(tmpDir, 'project', 'skills', 'project-skill'), 'project-skill');
    createSkill(join(tmpDir, 'project', 'skills', 'cached-skill'), 'cached-skill');
    mkdirSync(join(tmpDir, 'project', 'skills', 'plugin-folder'), { recursive: true });
    const registryPath = join(tmpDir, 'project', 'registry', 'skills.json');
    mkdirSync(join(tmpDir, 'project', 'registry'), { recursive: true });
    writeFileSync(
      registryPath,
      JSON.stringify({
        skills: {
          'project-skill': { name: 'project-skill', origin: 'local' },
          'cached-skill': { name: 'cached-skill', origin: 'codex-plugin-cache' },
        },
      }),
      'utf-8',
    );

    const result = discoverSkills({
      home: tmpDir,
      projectRoot: join(tmpDir, 'project'),
      registryPath,
    });

    const byName = new Map(result.map((skill) => [skill.name, skill]));
    expect([...byName.keys()].sort()).toEqual(['cached-skill', 'project-skill']);
    expect(byName.get('project-skill')?.source).toBe('skillgov-project');
    expect(byName.get('project-skill')?.sourceLabel).toBe('手动导入');
    expect(byName.get('project-skill')?.agentTargets).toEqual([]);
    expect(byName.get('project-skill')?.alreadyImported).toBe(true);
    expect(byName.get('cached-skill')?.sourceLabel).toBe('Codex 插件缓存');
    expect(byName.get('cached-skill')?.alreadyImported).toBe(true);
  });

  it('merges duplicate project and agent skills into one row with agent targets', () => {
    createSkill(join(tmpDir, 'project', 'skills', 'shared-skill'), 'shared-skill');
    createSkill(join(tmpDir, '.codex', 'skills', 'shared-skill'), 'shared-skill');
    const result = discoverSkills({
      home: tmpDir,
      projectRoot: join(tmpDir, 'project'),
    });

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('shared-skill');
    expect(result[0].sourceLabel).toBe('SkillGov 技能库');
    expect(result[0].agentTargets).toEqual(['codex']);
    expect(result[0].alreadyImported).toBe(true);
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
