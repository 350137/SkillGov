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

  it('shows the screenshot-style status table columns and multiple agent chips', async () => {
    const onSelectSkill = vi.fn();
    const skills: Skill[] = [
      {
        name: 'multi-agent-skill',
        displayDescription: {
          en: 'Supports repeatable governance workflows.',
        },
        path: 'D:/SkillGov/skills/multi-agent-skill',
        sourceLabel: 'Codex plugin cache',
        validationStatus: 'pass',
        version: '1.2.3',
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
          onToggleSelect={vi.fn()}
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
    expect(container.textContent).not.toContain('Path');
    expect(container.textContent).toContain('Description');
    expect(container.textContent).toContain('Target Agent');
    expect(container.textContent).toContain('Version');
    expect(container.textContent).toContain('Supports repeatable governance workflows.');
    expect(container.textContent).toContain('Claude');
    expect(container.textContent).toContain('Codex');
    expect(container.textContent).toContain('Mapped');
    expect(container.textContent).toContain('1.2.3');

    expect(container.querySelector('select[aria-label="Agents"]')).toBeFalsy();

    const firstRow = container.querySelector('tbody tr');
    await act(async () => {
      firstRow?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onSelectSkill).toHaveBeenCalledOnce();
  });
});
