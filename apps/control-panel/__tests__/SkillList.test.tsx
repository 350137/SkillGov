// Tests the SkillList React component pagination with a jsdom browser environment.
// @vitest-environment jsdom
import { act } from 'react';
import { type Root, createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SkillList } from '../src/components/SkillList';
import i18n from '../src/i18n';
import type { Skill } from '../src/types';

let container: HTMLDivElement;
let root: Root;

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

beforeEach(async () => {
  await i18n.changeLanguage('en');
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('SkillList', () => {
  it('shows fifteen skills per page', async () => {
    const skills: Skill[] = Array.from({ length: 16 }, (_, index) => ({
      name: `skill-${index + 1}`,
      validationStatus: 'pass',
    }));

    await act(async () => {
      root.render(
        <SkillList
          skills={skills}
          view="status"
          selectedNames={new Set()}
          onToggleSelect={vi.fn()}
          onTogglePage={vi.fn()}
          onSelectSkill={vi.fn()}
          page={0}
          onPageChange={vi.fn()}
          targetProfiles={[]}
        />,
      );
    });

    expect(container.querySelectorAll('tbody tr')).toHaveLength(15);
    expect(container.textContent).toContain('skill-15');
    expect(container.textContent).not.toContain('skill-16');
  });

  it('shows the compact status table with multi-select and agent selector', async () => {
    const onSelectSkill = vi.fn();
    const onToggleSelect = vi.fn();
    const skills: Skill[] = [
      {
        name: 'multi-agent-skill',
        displayDescription: {
          en: 'Supports repeatable governance workflows.',
        },
        path: 'D:/SkillGov/skills/multi-agent-skill',
        sourceLabel: 'Codex plugin cache',
        validationStatus: 'pass',
        mappingSummary: { total: 2, linked: 2, missing: 0, conflict: 0 },
        agentStates: [
          {
            profileId: 'claude',
            profileLabel: 'Claude',
            state: 'managed-linked',
            path: 'D:/SkillGov/skills/multi-agent-skill',
          },
          {
            profileId: 'codex',
            profileLabel: 'Codex',
            state: 'managed-linked',
            path: 'D:/SkillGov/skills/multi-agent-skill',
          },
        ],
      },
    ];

    await act(async () => {
      root.render(
        <SkillList
          skills={skills}
          view="status"
          selectedNames={new Set()}
          onToggleSelect={onToggleSelect}
          onTogglePage={vi.fn()}
          onSelectSkill={onSelectSkill}
          page={0}
          onPageChange={vi.fn()}
          targetProfiles={[]}
        />,
      );
    });

    expect(container.textContent).not.toContain('Source');
    expect(container.textContent).not.toContain('Codex plugin cache');
    expect(container.textContent).not.toContain('Description');
    expect(container.textContent).not.toContain('Supports repeatable governance workflows.');
    expect(container.textContent).toContain('#');
    expect(container.textContent).toContain('Skill');
    expect(container.textContent).toContain('Status');
    expect(container.textContent).toContain('Agent');
    expect(container.textContent).toContain('Mapping');
    expect(container.textContent).toContain('Path');
    expect(container.textContent).toContain('2/2');
    expect(container.textContent).toContain('D:/SkillGov/skills/multi-agent-skill');
    expect(container.querySelector('table')?.className).toContain('table-fixed');
    expect(container.querySelector('table')?.className).toContain('text-sm');

    expect(container.querySelectorAll('tbody svg')).toHaveLength(0);

    const firstHeaderCell = container.querySelector('thead th');
    const firstBodyCell = container.querySelector('tbody td');
    expect(firstHeaderCell?.className).toContain('py-3');
    expect(firstBodyCell?.className).toContain('py-2');

    const skillNameCell = container.querySelector('[data-testid="skill-name-cell"]');
    expect(skillNameCell?.className).toContain('truncate');
    expect(skillNameCell?.getAttribute('title')).toBe('multi-agent-skill');

    const agentSelect = container.querySelector('select[aria-label="Agents"]');
    expect(agentSelect).toBeTruthy();
    expect(agentSelect?.querySelectorAll('option')).toHaveLength(2);
    expect(agentSelect?.className).toContain('h-8');

    const rowCheckbox = container.querySelector('tbody input[type="checkbox"]');
    await act(async () => {
      rowCheckbox?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onToggleSelect).toHaveBeenCalledWith('multi-agent-skill');
    expect(onSelectSkill).not.toHaveBeenCalled();

    const firstRow = container.querySelector('tbody tr');
    await act(async () => {
      firstRow?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onSelectSkill).toHaveBeenCalledOnce();
  });

  it('keeps descriptions in the purpose view only', async () => {
    const skills: Skill[] = [
      {
        name: 'purpose-skill',
        validationStatus: 'pass',
        displayDescription: {
          en: 'Purpose copy belongs in the purpose view.',
        },
      },
    ];

    await act(async () => {
      root.render(
        <SkillList
          skills={skills}
          view="purpose"
          selectedNames={new Set()}
          onToggleSelect={vi.fn()}
          onTogglePage={vi.fn()}
          onSelectSkill={vi.fn()}
          page={0}
          onPageChange={vi.fn()}
          targetProfiles={[]}
        />,
      );
    });

    expect(container.textContent).toContain('Purpose copy belongs in the purpose view.');
  });
});
