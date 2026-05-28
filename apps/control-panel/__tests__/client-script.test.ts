// @vitest-environment jsdom
// Tests for the control panel client script — skill selection, target population, and compatibility result rendering.
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { clientScriptFunctions, controlPanelClientScript } from '../src/client-script.js';
import { translations } from '../src/i18n.js';

const { selectSkillNumber, populateTargetOptions, renderCompatibilityResult, DEFAULT_TARGETS, STATUS_CLASSES } =
  clientScriptFunctions;

function createElement(id: string, tag = 'div'): HTMLElement {
  const el = document.createElement(tag);
  el.id = id;
  document.body.appendChild(el);
  return el;
}

beforeEach(() => {
  document.body.innerHTML = '';
  (window as any).t = (key: string) => translations.en[key] || key;
  (window as any).latestDiscoverData = [];
  (window as any).selectedSkill = null;
  (window as any).resolveSkillByNumber = (value: string) => {
    const idx = Number.parseInt(value, 10) - 1;
    return (window as any).latestDiscoverData[idx] || null;
  };
  (window as any).populateTargetOptions = populateTargetOptions;
  (window as any).renderCompatibilityResult = renderCompatibilityResult;
});

describe('selectSkillNumber', () => {
  it('updates selected-skill-title and selected-skill-meta when skill is found', () => {
    const titleEl = createElement('selected-skill-title');
    const metaEl = createElement('selected-skill-meta');
    createElement('target-agent-select', 'select');
    (window as any).latestDiscoverData = [
      { name: 'test-skill', source: 'codex-user', sourceLabel: 'Codex 本地', validationStatus: 'pass', agentTargets: ['codex'] },
    ];

    selectSkillNumber('1');

    expect(titleEl.textContent).toBe('test-skill');
    expect(metaEl.textContent).toContain('Codex 本地');
    expect(metaEl.textContent).toContain('pass');
    expect(metaEl.textContent).toContain('codex');
  });

  it('shows noSkillSelected message when skill number is invalid', () => {
    const titleEl = createElement('selected-skill-title');
    const metaEl = createElement('selected-skill-meta');

    selectSkillNumber('99');

    expect(titleEl.textContent).toBe('Select a skill from the library.');
    expect(metaEl.textContent).toBe('');
  });

  it('does not crash when DOM elements are missing', () => {
    (window as any).latestDiscoverData = [{ name: 'x', source: 'a', validationStatus: 'pass', agentTargets: [] }];
    expect(() => selectSkillNumber('1')).not.toThrow();
  });
});

describe('populateTargetOptions', () => {
  it('uses agentTargets from skill when available', () => {
    const select = createElement('target-agent-select', 'select') as HTMLSelectElement;
    populateTargetOptions({ agentTargets: ['codex'] } as any);

    expect(select.options.length).toBe(1);
    expect(select.options[0].value).toBe('codex');
    expect(select.options[0].textContent).toBe('Codex');
  });

  it('falls back to DEFAULT_TARGETS when agentTargets is empty', () => {
    const select = createElement('target-agent-select', 'select') as HTMLSelectElement;
    populateTargetOptions({ agentTargets: [] } as any);

    expect(select.options.length).toBe(DEFAULT_TARGETS.length);
    expect(select.options[0].value).toBe('codex');
    expect(select.options[1].value).toBe('claude');
  });

  it('falls back to DEFAULT_TARGETS when agentTargets is missing', () => {
    const select = createElement('target-agent-select', 'select') as HTMLSelectElement;
    populateTargetOptions({} as any);

    expect(select.options.length).toBe(DEFAULT_TARGETS.length);
  });

  it('does not crash when target-agent-select is missing', () => {
    expect(() => populateTargetOptions({ agentTargets: ['codex'] } as any)).not.toThrow();
  });
});

describe('renderCompatibilityResult', () => {
  it('renders compatible status with badge and reason', () => {
    const card = createElement('compat-result-card');
    createElement('output', 'pre');

    renderCompatibilityResult({ status: 'compatible', reason: 'All good' });

    expect(card.innerHTML).toContain('status-badge');
    expect(card.innerHTML).toContain('status-pass');
    expect(card.innerHTML).toContain('Compatible');
    expect(card.innerHTML).toContain('All good');
  });

  it('renders needs-overlay status with suggested action', () => {
    const card = createElement('compat-result-card');
    createElement('output', 'pre');

    renderCompatibilityResult({ status: 'needs-overlay', suggestedAction: 'Create overlay' });

    expect(card.innerHTML).toContain('status-fixable');
    expect(card.innerHTML).toContain('Create overlay');
  });

  it('renders unsupported status with fail badge', () => {
    const card = createElement('compat-result-card');
    createElement('output', 'pre');

    renderCompatibilityResult({ status: 'unsupported', reason: 'Not supported' });

    expect(card.innerHTML).toContain('status-fail');
    expect(card.innerHTML).toContain('Not supported');
  });

  it('writes raw JSON to output element', () => {
    createElement('compat-result-card');
    const output = createElement('output', 'pre') as HTMLPreElement;
    const data = { status: 'compatible', reason: 'ok' };

    renderCompatibilityResult(data);

    expect(output.textContent).toBe(JSON.stringify(data, null, 2));
  });

  it('does not crash when DOM elements are missing', () => {
    expect(() => renderCompatibilityResult({ status: 'compatible' })).not.toThrow();
  });
});

describe('script structure', () => {
  it('does not use fixed formatMappingStatus with hardcoded codex/claude', () => {
    expect(controlPanelClientScript).not.toContain("formatMappingStatus(s.mappingTargets, 'codex')");
    expect(controlPanelClientScript).not.toContain("formatMappingStatus(s.mappingTargets, 'claude')");
  });

  it('contains selectSkillNumber function', () => {
    expect(controlPanelClientScript).toContain('function selectSkillNumber(');
  });

  it('contains populateTargetOptions function', () => {
    expect(controlPanelClientScript).toContain('function populateTargetOptions(');
  });

  it('contains renderCompatibilityResult function', () => {
    expect(controlPanelClientScript).toContain('function renderCompatibilityResult(');
  });

  it('contains checkSelectedCompatibility function', () => {
    expect(controlPanelClientScript).toContain('async function checkSelectedCompatibility(');
  });

  it('uses selectedSkill for install/uninstall instead of fixed input fields', () => {
    expect(controlPanelClientScript).toContain('selectedSkill.name');
    expect(controlPanelClientScript).not.toContain("getElementById('install-skill')");
  });
});

describe('i18n compatibility keys', () => {
  const requiredKeys = [
    'compatibleStatus',
    'needsOverlayStatus',
    'unsupportedStatus',
    'unknownStatus',
    'rawJsonSummary',
    'selectedSkillHeading',
    'targetAgentHeading',
    'mappingHeading',
    'mapButton',
    'unmapButton',
    'outputSummary',
    'noSkillSelected',
    'noTargetAvailable',
  ];

  for (const key of requiredKeys) {
    it(`en has key "${key}"`, () => {
      expect(translations.en).toHaveProperty(key);
    });
    it(`zh has key "${key}"`, () => {
      expect(translations.zh).toHaveProperty(key);
    });
  }
});
