// Tests for local skill discovery using configured target profile skill directories.
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { discoverSkillInventory, discoverSkills } from '../discovery.js';

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

const codexProfile = {
  id: 'codex',
  label: 'Codex',
  skillDirs: [] as string[],
  linkMode: 'junction' as const,
  supports: { skillMd: true, allowedTools: 'partial' as const, scripts: 'unknown' as const },
};

const claudeProfile = {
  id: 'claude',
  label: 'Claude',
  skillDirs: [] as string[],
  linkMode: 'junction' as const,
  supports: { skillMd: true, allowedTools: 'full' as const, scripts: 'unknown' as const },
};

function defaultTargets() {
  return [
    { ...codexProfile, skillDirs: [join(tmpDir, '.codex', 'skills')] },
    { ...claudeProfile, skillDirs: [join(tmpDir, '.claude', 'skills')] },
  ];
}

describe('discoverSkills', () => {
  it('returns empty array when no skill directories exist', () => {
    const result = discoverSkills({ home: tmpDir, targets: defaultTargets() });
    expect(result).toEqual([]);
  });

  it('finds codex-user skills with agent state', () => {
    createSkill(join(tmpDir, '.codex', 'skills', 'my-skill'), 'my-skill');
    const result = discoverSkills({ home: tmpDir, targets: defaultTargets() });
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('my-skill');
    expect(result[0].source).toBe('agent');
    expect(result[0].validationStatus).toBe('pass');
    expect(result[0].alreadyImported).toBe(false);
    expect(result[0].agentStates).toHaveLength(2);
    const codexState = result[0].agentStates.find((s) => s.profileId === 'codex');
    expect(codexState?.state).toBe('unmanaged-local');
    const claudeState = result[0].agentStates.find((s) => s.profileId === 'claude');
    expect(claudeState?.state).toBe('unmapped');
  });

  it('finds claude-user skills with agent state', () => {
    createSkill(join(tmpDir, '.claude', 'skills', 'claude-skill'), 'claude-skill');
    const result = discoverSkills({ home: tmpDir, targets: defaultTargets() });
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('claude-skill');
    expect(result[0].source).toBe('agent');
    const claudeState = result[0].agentStates.find((s) => s.profileId === 'claude');
    expect(claudeState?.state).toBe('unmanaged-local');
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
      targets: defaultTargets(),
    });

    const byName = new Map(result.map((skill) => [skill.name, skill]));
    expect([...byName.keys()].sort()).toEqual(['cached-skill', 'project-skill']);
    expect(byName.get('project-skill')?.source).toBe('project');
    expect(byName.get('project-skill')?.sourceLabel).toBe('手动导入');
    expect(byName.get('project-skill')?.alreadyImported).toBe(true);
    expect(byName.get('cached-skill')?.sourceLabel).toBe('Codex 插件缓存');
    expect(byName.get('cached-skill')?.alreadyImported).toBe(true);
  });

  it('merges duplicate project and agent skills into one row with agent states', () => {
    createSkill(join(tmpDir, 'project', 'skills', 'shared-skill'), 'shared-skill');
    createSkill(join(tmpDir, '.codex', 'skills', 'shared-skill'), 'shared-skill');
    const result = discoverSkills({
      home: tmpDir,
      projectRoot: join(tmpDir, 'project'),
      targets: defaultTargets(),
    });

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('shared-skill');
    expect(result[0].source).toBe('project');
    expect(result[0].alreadyImported).toBe(true);
    const codexState = result[0].agentStates.find((s) => s.profileId === 'codex');
    expect(codexState?.state).toBe('unmanaged-local');
  });

  it('finds skills from all target profile directories', () => {
    createSkill(join(tmpDir, '.codex', 'skills', 'codex-skill'), 'codex-skill');
    createSkill(join(tmpDir, '.claude', 'skills', 'claude-skill'), 'claude-skill');
    const result = discoverSkills({ home: tmpDir, targets: defaultTargets() });
    expect(result).toHaveLength(2);
    const names = result.map((s) => s.name).sort();
    expect(names).toEqual(['claude-skill', 'codex-skill']);
  });

  it('returns skills in stable alphabetical order', () => {
    createSkill(join(tmpDir, '.codex', 'skills', 'zeta-skill'), 'zeta-skill');
    createSkill(join(tmpDir, '.claude', 'skills', 'alpha-skill'), 'alpha-skill');
    createSkill(join(tmpDir, 'project', 'skills', 'middle-skill'), 'middle-skill');

    const result = discoverSkills({
      home: tmpDir,
      projectRoot: join(tmpDir, 'project'),
      targets: defaultTargets(),
    });

    expect(result.map((s) => s.name)).toEqual(['alpha-skill', 'middle-skill', 'zeta-skill']);
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
    const result = discoverSkills({ home: tmpDir, registryPath, targets: defaultTargets() });
    expect(result[0].alreadyImported).toBe(true);
  });

  it('excludes directories without SKILL.md and reports them as non-skill directories', () => {
    mkdirSync(join(tmpDir, '.codex', 'skills', 'broken'), { recursive: true });
    writeFileSync(join(tmpDir, '.codex', 'skills', 'broken', 'readme.txt'), 'not a skill', 'utf-8');
    const result = discoverSkills({ home: tmpDir, targets: defaultTargets() });
    expect(result).toEqual([]);

    const inventory = discoverSkillInventory({ home: tmpDir, targets: defaultTargets() });
    expect(inventory.skills).toEqual([]);
    expect(inventory.nonSkillDirectories).toEqual([
      {
        name: 'broken',
        path: join(tmpDir, '.codex', 'skills', 'broken'),
        issue: 'Missing SKILL.md',
      },
    ]);
  });

  it('reports fixable status for skills with warnings', () => {
    const dir = join(tmpDir, '.codex', 'skills', 'mismatch');
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, 'SKILL.md'),
      '---\nname: different-name\ndescription: test\n---\n\n# mismatch\n',
      'utf-8',
    );
    const result = discoverSkills({ home: tmpDir, targets: defaultTargets() });
    expect(result[0].validationStatus).toBe('fixable');
  });

  it('skips .system directory in agent skills', () => {
    createSkill(join(tmpDir, '.codex', 'skills', '.system', 'internal'), 'internal');
    createSkill(join(tmpDir, '.codex', 'skills', 'real-skill'), 'real-skill');
    const result = discoverSkills({ home: tmpDir, targets: defaultTargets() });
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('real-skill');
  });

  it('populates agentStates with both codex and claude when same skill exists in both directories', () => {
    createSkill(join(tmpDir, '.codex', 'skills', 'shared-skill'), 'shared-skill');
    createSkill(join(tmpDir, '.claude', 'skills', 'shared-skill'), 'shared-skill');
    const result = discoverSkills({ home: tmpDir, targets: defaultTargets() });
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('shared-skill');
    expect(result[0].agentStates).toHaveLength(2);
    expect(result[0].agentStates.every((s) => s.state === 'unmanaged-local')).toBe(true);
  });

  it('detects managed-linked state when a junction points to canonical skill', () => {
    createSkill(join(tmpDir, 'project', 'skills', 'managed-skill'), 'managed-skill');
    const linkPath = join(tmpDir, '.codex', 'skills', 'managed-skill');
    mkdirSync(join(tmpDir, '.codex', 'skills'), { recursive: true });
    symlinkSync(join(tmpDir, 'project', 'skills', 'managed-skill'), linkPath, 'junction');

    const result = discoverSkills({
      home: tmpDir,
      projectRoot: join(tmpDir, 'project'),
      targets: defaultTargets(),
    });
    expect(result).toHaveLength(1);
    const codexState = result[0].agentStates.find((s) => s.profileId === 'codex');
    expect(codexState?.state).toBe('managed-linked');
    const claudeState = result[0].agentStates.find((s) => s.profileId === 'claude');
    expect(claudeState?.state).toBe('unmapped');
  });

  it('detects conflict state when a junction points to a different location', () => {
    createSkill(join(tmpDir, 'project', 'skills', 'conflict-skill'), 'conflict-skill');
    const otherDir = join(tmpDir, 'other', 'conflict-skill');
    mkdirSync(otherDir, { recursive: true });
    writeFileSync(join(otherDir, 'SKILL.md'), 'other', 'utf-8');
    const linkPath = join(tmpDir, '.codex', 'skills', 'conflict-skill');
    mkdirSync(join(tmpDir, '.codex', 'skills'), { recursive: true });
    symlinkSync(otherDir, linkPath, 'junction');

    const result = discoverSkills({
      home: tmpDir,
      projectRoot: join(tmpDir, 'project'),
      targets: defaultTargets(),
    });
    expect(result).toHaveLength(1);
    const codexState = result[0].agentStates.find((s) => s.profileId === 'codex');
    expect(codexState?.state).toBe('conflict');
  });

  it('computes mappingSummary from agentStates', () => {
    createSkill(join(tmpDir, 'project', 'skills', 'summary-skill'), 'summary-skill');
    const codexLinkPath = join(tmpDir, '.codex', 'skills', 'summary-skill');
    mkdirSync(join(tmpDir, '.codex', 'skills'), { recursive: true });
    symlinkSync(join(tmpDir, 'project', 'skills', 'summary-skill'), codexLinkPath, 'junction');

    const result = discoverSkills({
      home: tmpDir,
      projectRoot: join(tmpDir, 'project'),
      targets: defaultTargets(),
    });
    expect(result).toHaveLength(1);
    expect(result[0].mappingSummary).toEqual({
      total: 1,
      linked: 1,
      missing: 0,
      conflict: 0,
    });
  });

  it('uses custom target profiles for discovery', () => {
    createSkill(join(tmpDir, 'custom-agent', 'skills', 'custom-skill'), 'custom-skill');
    const customTargets = [
      {
        id: 'custom-agent',
        label: 'Custom Agent',
        skillDirs: [join(tmpDir, 'custom-agent', 'skills')],
        linkMode: 'junction' as const,
        supports: { skillMd: true, allowedTools: 'partial' as const, scripts: 'unknown' as const },
      },
    ];
    const result = discoverSkills({ home: tmpDir, targets: customTargets });
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('custom-skill');
    expect(result[0].agentStates).toHaveLength(1);
    expect(result[0].agentStates[0].profileId).toBe('custom-agent');
    expect(result[0].agentStates[0].state).toBe('unmanaged-local');
  });
});
