// Tests for frontend API adapters; verifies web fetch routes and desktop Tauri command names.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { webApi } from '../src/api/controlPanelApi';
import { desktopApi } from '../src/api/desktopApi';

const invokeMock = vi.hoisted(() => vi.fn());
const originalFetch = globalThis.fetch;

vi.mock('@tauri-apps/api/core', () => ({
  invoke: invokeMock,
}));

beforeEach(() => {
  invokeMock.mockReset();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('frontend API adapters', () => {
  it('web adapter posts remote skill requests to local API routes', async () => {
    const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({
        url: String(input),
        body: JSON.parse(String(init?.body || '{}')) as Record<string, unknown>,
      });
      return { json: async () => ({ ok: true }) } as Response;
    }) as typeof fetch;

    await webApi.searchRemoteSkills('typescript', 10);
    await webApi.previewRemoteSkill('github/example/example-skill');
    await webApi.installRemoteSkill('github/example/example-skill');

    expect(calls).toEqual([
      { url: '/api/remote/search', body: { query: 'typescript', limit: 10 } },
      { url: '/api/remote/preview', body: { remoteId: 'github/example/example-skill' } },
      { url: '/api/remote/install', body: { remoteId: 'github/example/example-skill' } },
    ]);
  });

  it('desktop adapter invokes remote skill Tauri commands', async () => {
    invokeMock.mockResolvedValue({ ok: true });

    await desktopApi.searchRemoteSkills('typescript', 10);
    await desktopApi.previewRemoteSkill('github/example/example-skill');
    await desktopApi.installRemoteSkill('github/example/example-skill');

    expect(invokeMock).toHaveBeenNthCalledWith(1, 'search_remote_skills', {
      query: 'typescript',
      limit: 10,
    });
    expect(invokeMock).toHaveBeenNthCalledWith(2, 'preview_remote_skill', {
      remoteId: 'github/example/example-skill',
    });
    expect(invokeMock).toHaveBeenNthCalledWith(3, 'install_remote_skill', {
      remoteId: 'github/example/example-skill',
    });
  });
});
