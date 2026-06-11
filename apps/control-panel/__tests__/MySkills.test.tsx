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
  it('renders the dashboard metrics and primary skill-library action', async () => {
    apiMock.discover.mockResolvedValue({
      skills: [
        {
          name: 'brainstorming',
          validationStatus: 'pass',
          mappingSummary: { total: 1, linked: 1, missing: 0, conflict: 0 },
          agentStates: [
            {
              profileId: 'claude',
              profileLabel: 'Claude',
              state: 'managed-linked',
              path: 'D:/SkillGov/skills/brainstorming',
            },
          ],
        },
        {
          name: 'docx-mcp',
          validationStatus: 'fail',
          mappingSummary: { total: 1, linked: 0, missing: 0, conflict: 1 },
        },
      ],
      nonSkillDirectories: ['logs'],
      targetProfiles: [],
    });

    await act(async () => {
      root.render(
        <MemoryRouter>
          <MySkills />
        </MemoryRouter>,
      );
      await Promise.resolve();
    });

    const metrics = container.querySelector('[data-testid="dashboard-metrics"]');
    const toolbar = container.querySelector('[data-testid="skill-library-toolbar"]');
    const headerActions = container.querySelector('[data-testid="skill-library-header-actions"]');
    const metricCards = Array.from(metrics?.children || []);
    const firstMetricIcon = metricCards[0]?.querySelector('div');

    expect(metrics?.textContent).toContain('Total Skills');
    expect(metrics?.textContent).toContain('2');
    expect(metrics?.textContent).toContain('Applied');
    expect(metrics?.textContent).toContain('1');
    expect(metrics?.textContent).toContain('Issues');
    expect(metrics?.textContent).toContain('1');
    expect(metrics?.textContent).toContain('Non-Skill Dirs');
    expect(metrics?.textContent).toContain('1');
    expect(metrics?.className).toContain('max-w-[1280px]');
    expect(metricCards).toHaveLength(4);
    expect(metricCards[0]?.className).toContain('min-h-[116px]');
    expect(metricCards[0]?.className).toContain('gap-5');
    expect(metricCards[0]?.className).toContain('px-6');
    expect(firstMetricIcon?.className).toContain('h-[64px]');
    expect(firstMetricIcon?.className).toContain('w-[64px]');
    expect(toolbar?.querySelector('details')).toBeFalsy();
    expect(toolbar?.querySelectorAll('select')).toHaveLength(4);
    expect(toolbar?.textContent).toContain('All Statuses');
    expect(toolbar?.textContent).not.toContain('All Sources');
    expect(toolbar?.textContent).toContain('All Mappings');
    expect(toolbar?.textContent).toContain('All Agents');
    expect(toolbar?.textContent).not.toContain('Add Skill');
    expect(toolbar?.textContent).toContain('Default Sort');
    expect(headerActions?.textContent).toContain('Refresh Skill Library');
    expect(headerActions?.textContent).toContain('Add Skill');
    expect(headerActions?.textContent).toContain('Export');
    expect(headerActions?.textContent).toContain('Skill Status');
    expect(headerActions?.textContent).toContain('Skill Purpose');
  });
});
