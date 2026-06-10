// Tests the RemoteSkillSearch React component with a jsdom browser environment.
// @vitest-environment jsdom
import { act } from 'react';
import { type Root, createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RemoteSkillSearch } from '../src/components/RemoteSkillSearch';
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

function buttonByText(label: string): HTMLButtonElement {
  const button = [...container.querySelectorAll('button')].find((el) =>
    (el.textContent || '').includes(label),
  );
  if (!button) throw new Error(`Button not found: ${label}`);
  return button;
}

function setInputValue(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('RemoteSkillSearch', () => {
  it('shows an empty state when no online skills match the search', async () => {
    const apiClient: TestApiClient = {
      searchRemoteSkills: vi.fn(async () => ({
        query: 'missing',
        source: 'skills.sh',
        count: 0,
        skills: [],
      })),
      previewRemoteSkill: vi.fn(),
      installRemoteSkill: vi.fn(),
    };

    await act(async () => {
      root.render(<RemoteSkillSearch apiClient={apiClient} onInstallComplete={vi.fn()} />);
    });

    const input = container.querySelector('input');
    if (!input) throw new Error('Search input missing');

    await act(async () => {
      setInputValue(input, 'missing');
      buttonByText('Search').click();
      await Promise.resolve();
    });

    expect(textContent()).toContain('No online skills found.');
  });

  it('searches, previews, installs, and refreshes local skills', async () => {
    const onInstallComplete = vi.fn();
    const apiClient: TestApiClient = {
      searchRemoteSkills: vi.fn(async () => ({
        query: 'typescript',
        source: 'skills.sh',
        count: 1,
        skills: [
          {
            id: 'github/example/typescript-skill',
            skillId: 'typescript-skill',
            name: 'typescript-skill',
            source: 'github/example',
            installs: 42,
            installed: false,
          },
        ],
      })),
      previewRemoteSkill: vi.fn(async () => ({
        id: 'github/example/typescript-skill',
        name: 'typescript-skill',
        description: 'Helps with TypeScript.',
        fileCount: 2,
        totalBytes: 120,
        remoteHash: 'abc123',
        status: 'pass',
        issues: [],
      })),
      installRemoteSkill: vi.fn(async () => ({
        status: 'pass',
        skillName: 'typescript-skill',
        issues: [],
        message: 'Installed remote skill "typescript-skill".',
      })),
    };

    await act(async () => {
      root.render(
        <RemoteSkillSearch apiClient={apiClient} onInstallComplete={onInstallComplete} />,
      );
    });

    const input = container.querySelector('input');
    if (!input) throw new Error('Search input missing');

    await act(async () => {
      setInputValue(input, 'typescript');
      buttonByText('Search').click();
      await Promise.resolve();
    });

    expect(apiClient.searchRemoteSkills).toHaveBeenCalledWith('typescript', 20);
    expect(textContent()).toContain('typescript-skill');

    await act(async () => {
      buttonByText('Preview').click();
    });

    expect(apiClient.previewRemoteSkill).toHaveBeenCalledWith('github/example/typescript-skill');
    expect(textContent()).toContain('Helps with TypeScript.');
    expect(buttonByText('Install').disabled).toBe(false);

    await act(async () => {
      buttonByText('Install').click();
    });

    expect(apiClient.installRemoteSkill).toHaveBeenCalledWith('github/example/typescript-skill');
    expect(onInstallComplete).toHaveBeenCalledTimes(1);
    expect(textContent()).toContain('Installed remote skill');
  });
});
