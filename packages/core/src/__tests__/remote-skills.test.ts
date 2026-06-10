// Tests for remote skill intake guards; validates query, remote IDs, payload limits, and safe file paths.
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
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
