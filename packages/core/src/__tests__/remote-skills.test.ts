// Tests for remote skill intake guards; validates query, remote IDs, payload limits, and safe file paths.
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type SkillsRegistry, readRegistry } from '../registry.js';
import {
  installRemoteSkill,
  normalizeRemoteQuery,
  previewRemoteSkill,
  safeDownloadedFilePath,
  searchRemoteSkills,
  validateDownloadedSkillPayload,
  validateRemoteSkillId,
} from '../remote-skills.js';

function validPayload(overrides: Record<string, string> = {}) {
  return {
    files: [
      {
        path: 'SKILL.md',
        contents: [
          '---',
          'name: remote-test',
          'description: a remote test skill',
          '---',
          '',
          '# Remote test',
        ].join('\n'),
      },
      ...Object.entries(overrides).map(([path, contents]) => ({ path, contents })),
    ],
    hash: 'abc123',
  };
}

describe('remote skill guards', () => {
  it('normalizes query text and clamps result limits', () => {
    expect(normalizeRemoteQuery('  typescript  ', 100)).toEqual({
      query: 'typescript',
      limit: 50,
    });
    expect(normalizeRemoteQuery('react', 0)).toEqual({ query: 'react', limit: 1 });
  });

  it('rejects empty and oversized remote queries', () => {
    expect(() => normalizeRemoteQuery('   ')).toThrow(/query/i);
    expect(() => normalizeRemoteQuery('x'.repeat(101))).toThrow(/100/);
  });

  it('accepts source-like remote skill IDs made from safe segments', () => {
    expect(validateRemoteSkillId('github/awesome-copilot/javascript-typescript-jest')).toBe(
      'github/awesome-copilot/javascript-typescript-jest',
    );
    expect(validateRemoteSkillId('owner.repo/repo_name/skill-1')).toBe(
      'owner.repo/repo_name/skill-1',
    );
  });

  it('rejects traversal, absolute, and malformed remote skill IDs', () => {
    const invalidIds = [
      '',
      '../escape',
      'github//skill',
      '/github/repo/skill',
      'C:/github/repo/skill',
      'github\\repo\\skill',
      'github/repo/../skill',
      'github/repo/skill?',
    ];

    for (const id of invalidIds) {
      expect(() => validateRemoteSkillId(id)).toThrow(/remote skill id/i);
    }
  });

  it('validates a safe downloaded payload and reports its size', () => {
    const result = validateDownloadedSkillPayload(validPayload({ 'docs/guide.md': 'hello' }));

    expect(result.status).toBe('pass');
    expect(result.issues).toEqual([]);
    expect(result.fileCount).toBe(2);
    expect(result.totalBytes).toBeGreaterThan(0);
    expect(result.skillMd).toContain('name: remote-test');
  });

  it('rejects payloads without a root SKILL.md', () => {
    const result = validateDownloadedSkillPayload({
      files: [{ path: 'nested/SKILL.md', contents: '# nope' }],
      hash: 'abc123',
    });

    expect(result.status).toBe('fail');
    expect(result.issues.join('\n')).toMatch(/root SKILL\.md/i);
  });

  it('rejects payloads with unsafe paths and oversized contents', () => {
    const result = validateDownloadedSkillPayload({
      files: [
        { path: 'SKILL.md', contents: 'x'.repeat(512 * 1024 + 1) },
        { path: '../escape.txt', contents: 'escape' },
        { path: 'docs/bad:name.md', contents: 'bad name' },
      ],
      hash: 'abc123',
    });

    expect(result.status).toBe('fail');
    expect(result.issues.join('\n')).toMatch(/too large/i);
    expect(result.issues.join('\n')).toMatch(/unsafe/i);
  });

  it('resolves downloaded file paths inside the staging directory only', () => {
    const stagingDir = join('C:', 'SkillGov', 'incoming', '.remote-downloads', 'remote-test');
    const resolved = safeDownloadedFilePath(stagingDir, 'docs/guide.md');

    expect(resolved).toBe(join(stagingDir, 'docs', 'guide.md'));
    expect(() => safeDownloadedFilePath(stagingDir, '../outside.md')).toThrow(/unsafe/i);
    expect(() => safeDownloadedFilePath(stagingDir, 'C:/outside.md')).toThrow(/unsafe/i);
    expect(() => safeDownloadedFilePath(stagingDir, 'docs\\outside.md')).toThrow(/unsafe/i);
    expect(() => safeDownloadedFilePath(stagingDir, 'docs/bad:name.md')).toThrow(/unsafe/i);
  });
});

describe('remote skill install', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = join(tmpdir(), `skillgov-remote-install-${randomUUID()}`);
    mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  function projectRoot(): string {
    const root = join(tmpDir, 'project');
    mkdirSync(join(root, 'incoming'), { recursive: true });
    mkdirSync(join(root, 'skills'), { recursive: true });
    mkdirSync(join(root, 'registry'), { recursive: true });
    return root;
  }

  it('downloads a valid remote skill through the import pipeline', async () => {
    const root = projectRoot();

    const result = await installRemoteSkill('github/awesome-copilot/javascript-typescript-jest', {
      projectRoot: root,
      fetch: async () => ({
        ok: true,
        status: 200,
        json: async () => validPayload({ 'docs/guide.md': 'Use this skill.' }),
      }),
    });

    expect(result).toMatchObject({
      status: 'pass',
      skillName: 'remote-test',
      origin: 'remote:skills.sh:github/awesome-copilot/javascript-typescript-jest',
    });
    expect(existsSync(join(root, 'skills', 'remote-test', 'SKILL.md'))).toBe(true);
    expect(existsSync(join(root, 'skills', 'remote-test', 'docs', 'guide.md'))).toBe(true);
    expect(existsSync(join(root, 'incoming', '.remote-downloads'))).toBe(false);

    const registry = readRegistry<SkillsRegistry>(join(root, 'registry', 'skills.json'), {
      skills: {},
    });
    expect(registry.skills['remote-test'].origin).toBe(
      'remote:skills.sh:github/awesome-copilot/javascript-typescript-jest',
    );
  });

  it('rejects invalid remote skills without leaving incoming files', async () => {
    const root = projectRoot();

    const result = await installRemoteSkill('github/example/broken-skill', {
      projectRoot: root,
      fetch: async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          files: [
            {
              path: 'SKILL.md',
              contents: '---\nname: broken-skill\n---\n\n# Missing description\n',
            },
          ],
          hash: 'abc123',
        }),
      }),
    });

    expect(result.status).toBe('fail');
    expect(result.issues.join('\n')).toMatch(/description/i);
    expect(existsSync(join(root, 'incoming', 'broken-skill'))).toBe(false);
    expect(existsSync(join(root, 'incoming', '.remote-downloads'))).toBe(false);
    expect(existsSync(join(root, 'skills', 'broken-skill'))).toBe(false);
  });

  it('replaces an existing managed skill with a clear message', async () => {
    const root = projectRoot();
    const existing = join(root, 'skills', 'remote-test');
    mkdirSync(existing, { recursive: true });
    writeFileSync(join(existing, 'old.txt'), 'old file', 'utf-8');

    const result = await installRemoteSkill('github/example/remote-test', {
      projectRoot: root,
      fetch: async () => ({
        ok: true,
        status: 200,
        json: async () => validPayload({ 'new.txt': 'new file' }),
      }),
    });

    expect(result.status).toBe('pass');
    expect(result.message).toMatch(/replaced/i);
    expect(existsSync(join(root, 'skills', 'remote-test', 'old.txt'))).toBe(false);
    expect(readFileSync(join(root, 'skills', 'remote-test', 'new.txt'), 'utf-8')).toBe('new file');
  });

  it('rejects traversal payloads without writing outside the project', async () => {
    const root = projectRoot();
    const outside = join(root, 'outside.txt');

    const result = await installRemoteSkill('github/example/escape-skill', {
      projectRoot: root,
      fetch: async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          files: [
            {
              path: 'SKILL.md',
              contents:
                '---\nname: escape-skill\ndescription: a traversal test skill\n---\n\n# Escape\n',
            },
            { path: '../outside.txt', contents: 'escape' },
          ],
          hash: 'abc123',
        }),
      }),
    });

    expect(result.status).toBe('fail');
    expect(result.issues.join('\n')).toMatch(/unsafe/i);
    expect(existsSync(outside)).toBe(false);
    expect(existsSync(join(root, 'skills', 'escape-skill'))).toBe(false);
  });

  it('rejects install directories outside the project root before fetching', async () => {
    const root = projectRoot();
    let fetched = false;

    await expect(
      installRemoteSkill('github/example/outside-target', {
        projectRoot: root,
        incoming: join(tmpDir, 'outside-incoming'),
        fetch: async () => {
          fetched = true;
          return {
            ok: true,
            status: 200,
            json: async () => validPayload(),
          };
        },
      }),
    ).rejects.toThrow(/project root/i);
    expect(fetched).toBe(false);
  });
});

describe('remote skill search and preview', () => {
  it('normalizes skills.sh search results and marks locally installed skills', async () => {
    const calls: string[] = [];
    const fakeFetch = async (url: string) => {
      calls.push(url);
      return {
        ok: true,
        status: 200,
        json: async () => ({
          query: 'typescript',
          searchType: 'fuzzy',
          skills: [
            {
              id: 'github/awesome-copilot/javascript-typescript-jest',
              skillId: 'javascript-typescript-jest',
              name: 'javascript-typescript-jest',
              installs: 11038,
              source: 'github/awesome-copilot',
            },
            {
              id: 'wshobson/agents/typescript-advanced-types',
              skillId: 'typescript-advanced-types',
              name: 'typescript-advanced-types',
              installs: 46403,
              source: 'wshobson/agents',
            },
          ],
          count: 2,
        }),
      };
    };

    const result = await searchRemoteSkills('  typescript  ', {
      fetch: fakeFetch,
      limit: 100,
      installedSkills: [{ name: 'typescript-advanced-types', validationStatus: 'pass' }],
    });

    expect(calls[0]).toContain('https://skills.sh/api/search');
    expect(calls[0]).toContain('q=typescript');
    expect(calls[0]).toContain('limit=50');
    expect(result).toEqual({
      query: 'typescript',
      source: 'skills.sh',
      count: 2,
      skills: [
        {
          id: 'github/awesome-copilot/javascript-typescript-jest',
          skillId: 'javascript-typescript-jest',
          name: 'javascript-typescript-jest',
          installs: 11038,
          source: 'github/awesome-copilot',
          installed: false,
        },
        {
          id: 'wshobson/agents/typescript-advanced-types',
          skillId: 'typescript-advanced-types',
          name: 'typescript-advanced-types',
          installs: 46403,
          source: 'wshobson/agents',
          installed: true,
          validationStatus: 'pass',
        },
      ],
    });
  });

  it('reports remote search HTTP failures with status details', async () => {
    await expect(
      searchRemoteSkills('typescript', {
        fetch: async () => ({
          ok: false,
          status: 503,
          statusText: 'Unavailable',
          json: async () => ({}),
        }),
      }),
    ).rejects.toThrow(/503.*Unavailable/);
  });

  it('rejects malformed remote search responses', async () => {
    await expect(
      searchRemoteSkills('typescript', {
        fetch: async () => ({
          ok: true,
          status: 200,
          json: async () => ({ results: [] }),
        }),
      }),
    ).rejects.toThrow(/invalid response/i);
  });

  it('previews a remote skill download without writing files', async () => {
    const calls: string[] = [];
    const fakeFetch = async (url: string) => {
      calls.push(url);
      return {
        ok: true,
        status: 200,
        json: async () =>
          validPayload({
            'docs/guide.md': 'Use this skill when writing JavaScript tests.',
          }),
      };
    };

    const preview = await previewRemoteSkill('github/awesome-copilot/javascript-typescript-jest', {
      fetch: fakeFetch,
    });

    expect(calls).toEqual([
      'https://skills.sh/api/download/github/awesome-copilot/javascript-typescript-jest',
    ]);
    expect(preview).toMatchObject({
      id: 'github/awesome-copilot/javascript-typescript-jest',
      name: 'remote-test',
      description: 'a remote test skill',
      fileCount: 2,
      remoteHash: 'abc123',
      status: 'pass',
      issues: [],
    });
    expect(preview.totalBytes).toBeGreaterThan(0);
  });
});
