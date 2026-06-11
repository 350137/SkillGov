// Tests the App shell branding with a jsdom browser environment.
// @vitest-environment jsdom
import { act } from 'react';
import { type Root, createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/App';
import i18n from '../src/i18n';

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

describe('App', () => {
  it('uses the packaged desktop icon for the brand mark', async () => {
    await act(async () => {
      root.render(
        <MemoryRouter>
          <App />
        </MemoryRouter>,
      );
      await Promise.resolve();
    });

    const brandIcon = container.querySelector('[data-testid="app-brand-icon"]');

    expect(brandIcon?.tagName).toBe('IMG');
    expect(brandIcon?.getAttribute('alt')).toBe('SkillGov');
    expect(brandIcon?.getAttribute('src')).toContain('icon.ico');
  });
});
