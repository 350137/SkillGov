// Tests the SkillDetail React component with a jsdom browser environment.
// @vitest-environment jsdom
import { act } from 'react';
import { type Root, createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SkillDetail } from '../src/components/SkillDetail';
import i18n from '../src/i18n';
import type { Skill, TargetProfile } from '../src/types';

let container: HTMLDivElement;
let root: Root;

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function textContent(): string {
  return container.textContent || '';
}

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

describe('SkillDetail', () => {
  it('shows the skill introduction and validation metadata', async () => {
    const skill: Skill = {
      name: 'gh-address-comments',
      path: 'D:/SkillGov/skills/gh-address-comments',
      source: 'cache',
      sourceLabel: 'Codex plugin cache',
      validationStatus: 'fail',
      displayDescription: {
        en: 'Address actionable GitHub pull request review feedback.',
        reviewStatus: 'needs-review',
        source: 'SKILL.md description',
      },
      agentStates: [
        {
          profileId: 'codex',
          profileLabel: 'Codex',
          state: 'managed-linked',
          path: 'D:/SkillGov/skills/gh-address-comments',
        },
      ],
    };
    const targetProfiles: TargetProfile[] = [{ id: 'codex', label: 'Codex' }];

    await act(async () => {
      root.render(
        <SkillDetail skill={skill} targetProfiles={targetProfiles} onActionResult={vi.fn()} />,
      );
    });

    expect(textContent()).toContain('Introduction');
    expect(textContent()).toContain('Address actionable GitHub pull request review feedback.');
    expect(textContent()).toContain('Codex plugin cache');
    expect(textContent()).toContain('fail');
    expect(textContent()).toContain('needs-review');
    expect(textContent()).toContain('SKILL.md description');
  });
});
