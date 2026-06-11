// Tests the MySkills page layout with a jsdom browser environment.
// @vitest-environment jsdom
import { act } from 'react';
import { type Root, createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../src/i18n';
import { MySkills } from '../src/pages/MySkills';

const apiMock = vi.hoisted(() => ({
  getStatus: vi.fn(),
  discover: vi.fn(),
}));

vi.mock('../src/api', () => ({
  api: apiMock,
}));

let container: HTMLDivElement;
let root: Root;

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

beforeEach(async () => {
  await i18n.changeLanguage('en');
  apiMock.getStatus.mockResolvedValue({
    app: 'SkillGov',
    apiVersion: '0.1.0',
    projectRoot: 'D:/SkillGov',
    skills: [],
    installs: [],
    nonSkillDirectories: [],
    targetProfiles: [],
  });
  apiMock.discover.mockResolvedValue({
    skills: [],
    nonSkillDirectories: [],
    targetProfiles: [],
  });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.clearAllMocks();
});

describe('MySkills', () => {
  it('places refresh and export actions in the skill library header', async () => {
    await act(async () => {
      root.render(
        <MemoryRouter>
          <MySkills />
        </MemoryRouter>,
      );
      await Promise.resolve();
    });

    const headerActions = container.querySelector('[data-testid="skill-library-header-actions"]');
    const toolbar = container.querySelector('[data-testid="skill-library-toolbar"]');

    expect(headerActions?.textContent).toContain('Refresh Skill Library');
    expect(headerActions?.textContent).toContain('Export');
    expect(toolbar?.textContent).not.toContain('Refresh Skill Library');
    expect(toolbar?.textContent).not.toContain('Export');
  });
});
