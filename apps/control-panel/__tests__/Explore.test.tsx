// Tests the Explore page online marketplace layout with a jsdom browser environment.
// @vitest-environment jsdom
import { act } from 'react';
import { type Root, createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Explore } from '../src/pages/Explore';
import '../src/i18n';
import type { RemoteInstallResponse, RemoteSearchResponse, RemoteSkillPreview } from '../src/types';

let container: HTMLDivElement;
let root: Root;

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('Explore', () => {
  it('renders the online marketplace instead of the local skill library', async () => {
    const apiClient = {
      searchRemoteSkills: vi.fn(
        async (query: string): Promise<RemoteSearchResponse> => ({
          query,
          source: 'skills.sh',
          count: 1,
          skills: [
            {
              id: `github/example/${query}`,
              skillId: query,
              name: `${query}-skill`,
              source: 'github/example',
              installs: 10,
            },
          ],
        }),
      ),
      previewRemoteSkill: vi.fn(
        async (): Promise<RemoteSkillPreview> => ({
          id: 'github/example/skill',
          name: 'skill',
          fileCount: 1,
          totalBytes: 20,
          status: 'pass',
          issues: [],
        }),
      ),
      installRemoteSkill: vi.fn(
        async (): Promise<RemoteInstallResponse> => ({
          status: 'pass',
          issues: [],
        }),
      ),
    };

    await act(async () => {
      root.render(<Explore apiClient={apiClient} />);
      await Promise.resolve();
    });

    expect(container.textContent).toContain('Recommended Skills');
    expect(container.textContent).toContain('Explore Skills');
    expect(container.textContent).toContain('Skill Channels');
    expect(container.textContent).toContain('Most Downloaded');
    expect(container.textContent).toContain('AI');
    expect(container.textContent).toContain('Documentation');
    expect(container.textContent).not.toContain('Skill Library');
  });
});
