// Tests the SkillList React component pagination with a jsdom browser environment.
// @vitest-environment jsdom
import { act } from 'react';
import { type Root, createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SkillList } from '../src/components/SkillList';
import '../src/i18n';
import type { Skill } from '../src/types';

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
});
