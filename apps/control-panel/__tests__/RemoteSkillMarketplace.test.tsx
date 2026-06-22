// Tests the RemoteSkillMarketplace React component with a jsdom browser environment.
// @vitest-environment jsdom
import { act } from 'react';
import { type Root, createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  RemoteSkillMarketplace,
  preloadRemoteSkillSections,
  resetRemoteSkillSectionPreload,
} from '../src/components/RemoteSkillMarketplace';
import '../src/i18n';
import type { RemoteInstallResponse, RemoteSearchResponse, RemoteSkillPreview } from '../src/types';

interface TestApiClient {
  searchRemoteSkills: (query: string, limit?: number) => Promise<RemoteSearchResponse>;
  previewRemoteSkill: (remoteId: string) => Promise<RemoteSkillPreview>;
  installRemoteSkill: (remoteId: string) => Promise<RemoteInstallResponse>;
}

let container: HTMLDivElement;
let root: Root;

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function textContent(): string {
  return container.textContent || '';
}

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  resetRemoteSkillSectionPreload();
});

describe('RemoteSkillMarketplace', () => {
  it('loads recommended sections and sorts skills by installs', async () => {
    const apiClient: TestApiClient = {
      searchRemoteSkills: vi.fn(async (query) => ({
        query,
        source: 'skills.sh',
        count: 2,
        skills:
          query === 'skill'
            ? [
                {
                  id: 'github/example/low',
                  skillId: 'low',
                  name: 'low-download-skill',
                  source: 'github/example',
                  installs: 4,
                },
                {
                  id: 'github/example/high',
                  skillId: 'high',
                  name: 'high-download-skill',
                  source: 'github/example',
                  installs: 40,
                },
              ]
            : [
                {
                  id: `github/example/${query}`,
                  skillId: query,
                  name: `${query}-skill`,
                  source: 'github/example',
                  installs: 10,
                },
              ],
      })),
      previewRemoteSkill: vi.fn(),
      installRemoteSkill: vi.fn(),
    };

    await act(async () => {
      root.render(<RemoteSkillMarketplace apiClient={apiClient} />);
      await Promise.resolve();
    });

    expect(textContent()).toContain('Most Downloaded');
    expect(textContent()).toContain('Design');
    expect(textContent()).toContain('Programming');
    expect(textContent()).toContain('Daily Work');
    expect(textContent()).toContain('AI');
    expect(textContent()).toContain('Writing');
    expect(textContent()).toContain('Research');
    expect(textContent()).toContain('Automation');
    expect(textContent()).toContain('Documentation');
    expect(textContent()).toContain('Data');
    expect(textContent().indexOf('high-download-skill')).toBeLessThan(
      textContent().indexOf('low-download-skill'),
    );
  });

  it('reuses preloaded recommendation sections instead of searching again on mount', async () => {
    const apiClient: TestApiClient = {
      searchRemoteSkills: vi.fn(async (query) => ({
        query,
        source: 'skills.sh',
        count: 1,
        skills: [
          {
            id: `github/example/${query}`,
            skillId: query,
            name: `${query}-channel-skill`,
            source: 'github/example',
            installs: 12,
          },
        ],
      })),
      previewRemoteSkill: vi.fn(),
      installRemoteSkill: vi.fn(),
    };

    await preloadRemoteSkillSections(apiClient);
    const callsAfterPreload = apiClient.searchRemoteSkills.mock.calls.length;

    await act(async () => {
      root.render(<RemoteSkillMarketplace apiClient={apiClient} />);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(apiClient.searchRemoteSkills).toHaveBeenCalledTimes(callsAfterPreload);
    expect(textContent()).toContain('ai-channel-skill');
    expect(textContent()).toContain('documentation-channel-skill');
  });

  it('keeps other recommendation channels visible when one channel fails', async () => {
    const apiClient: TestApiClient = {
      searchRemoteSkills: vi.fn(async (query) => {
        if (query === 'ai') {
          throw new Error('network unavailable');
        }
        return {
          query,
          source: 'skills.sh',
          count: 1,
          skills: [
            {
              id: `github/example/${query}`,
              skillId: query,
              name: `${query}-skill`,
              source: 'github/example',
              installs: 8,
            },
          ],
        };
      }),
      previewRemoteSkill: vi.fn(),
      installRemoteSkill: vi.fn(),
    };

    await act(async () => {
      root.render(<RemoteSkillMarketplace apiClient={apiClient} />);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(textContent()).toContain('skill-skill');
    expect(textContent()).toContain('documentation-skill');
    expect(textContent()).toContain('AI');
    expect(textContent()).not.toContain('network unavailable');
    expect(textContent()).not.toContain('not iterable');
  });
});
