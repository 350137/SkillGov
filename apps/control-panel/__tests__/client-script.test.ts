// @vitest-environment jsdom
// Tests for the control panel client script — skill selection, target population, and compatibility result rendering.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clientScriptFunctions, controlPanelClientScript } from '../src/client-script.js';
import { translations } from '../src/i18n.js';

const {
  selectSkillNumber,
  populateTargetOptions,
  renderCompatibilityResult,
  DEFAULT_TARGETS,
  STATUS_CLASSES,
} = clientScriptFunctions;

interface TestSkill {
  name: string;
  path?: string;
  source?: string;
  sourceLabel?: string;
  validationStatus?: string;
  agentTargets?: string[];
  appliedAgents?: Array<{ id: string; label: string; source: string }>;
  mappingSummary?: { total: number; linked: number; missing: number; conflict: number };
}

interface TestWindow extends Window {
  t: (key: string) => string;
  latestDiscoverData: TestSkill[];
  selectedSkill: TestSkill | null;
  targetProfiles?: Array<{ id: string; label: string; skillDirs?: string[]; linkMode?: string }>;
  availableTargets?: Array<{ id: string; label: string }>;
  resolveSkillByNumber: (value: string) => TestSkill | null;
  populateTargetOptions: typeof populateTargetOptions;
  renderCompatibilityResult: typeof renderCompatibilityResult;
}

function testWindow(): TestWindow {
  return window as unknown as TestWindow;
}

function createElement(id: string, tag = 'div'): HTMLElement {
  const el = document.createElement(tag);
  el.id = id;
  document.body.appendChild(el);
  return el;
}

beforeEach(() => {
  document.body.innerHTML = '';
  const browserWindow = testWindow();
  browserWindow.t = (key: string) => (translations.en as Record<string, string>)[key] || key;
  browserWindow.latestDiscoverData = [];
  browserWindow.selectedSkill = null;
  browserWindow.resolveSkillByNumber = (value: string) => {
    const idx = Number.parseInt(value, 10) - 1;
    return browserWindow.latestDiscoverData[idx] || null;
  };
  browserWindow.populateTargetOptions = populateTargetOptions;
  browserWindow.renderCompatibilityResult = renderCompatibilityResult;
});

describe('selectSkillNumber', () => {
  it('updates selected-skill-title and selected-skill-meta when skill is found', () => {
    const titleEl = createElement('selected-skill-title');
    const metaEl = createElement('selected-skill-meta');
    createElement('target-agent-select', 'select');
    testWindow().latestDiscoverData = [
      {
        name: 'test-skill',
        source: 'codex-user',
        sourceLabel: 'Codex 本地',
        validationStatus: 'pass',
        agentTargets: ['codex'],
        appliedAgents: [{ id: 'codex', label: 'Codex', source: 'local' }],
      },
    ];

    selectSkillNumber('1');

    expect(titleEl.textContent).toBe('test-skill');
    expect(metaEl.textContent).toContain('Codex 本地');
    expect(metaEl.textContent).toContain('pass');
    expect(metaEl.textContent).toContain('Codex');
    expect(testWindow().selectedSkill?.name).toBe('test-skill');
  });

  it('displays all appliedAgents labels in meta when multiple agents use the skill', () => {
    createElement('selected-skill-title');
    createElement('selected-skill-meta');
    createElement('target-agent-select', 'select');
    testWindow().latestDiscoverData = [
      {
        name: 'multi-agent-skill',
        source: 'local',
        validationStatus: 'pass',
        agentTargets: ['codex', 'claude'],
        appliedAgents: [
          { id: 'codex', label: 'Codex', source: 'local' },
          { id: 'claude', label: 'Claude', source: 'mapping' },
        ],
      },
    ];

    selectSkillNumber('1');

    const metaEl = document.getElementById('selected-skill-meta');
    expect(metaEl?.textContent).toContain('Codex');
    expect(metaEl?.textContent).toContain('Claude');
  });

  it('shows noSkillSelected message when skill number is invalid', () => {
    const titleEl = createElement('selected-skill-title');
    const metaEl = createElement('selected-skill-meta');

    selectSkillNumber('99');

    expect(titleEl.textContent).toBe('Select a skill from the library.');
    expect(metaEl.textContent).toBe('');
    expect(testWindow().selectedSkill).toBeNull();
  });

  it('does not crash when DOM elements are missing', () => {
    testWindow().latestDiscoverData = [
      { name: 'x', source: 'a', validationStatus: 'pass', agentTargets: [] },
    ];
    expect(() => selectSkillNumber('1')).not.toThrow();
  });
});

describe('populateTargetOptions', () => {
  it('keeps all default targets available even when a skill is already used by one agent', () => {
    const select = createElement('target-agent-select', 'select') as HTMLSelectElement;
    populateTargetOptions({ name: 'test-skill', agentTargets: ['codex'] });

    expect(select.options.length).toBe(DEFAULT_TARGETS.length);
    expect(select.options[0].value).toBe('codex');
    expect(select.options[0].textContent).toBe('Codex');
    expect([...select.options].map((option) => option.value)).toContain('claude');
  });

  it('falls back to DEFAULT_TARGETS when agentTargets is empty', () => {
    const select = createElement('target-agent-select', 'select') as HTMLSelectElement;
    populateTargetOptions({ name: 'test-skill', agentTargets: [] });

    expect(select.options.length).toBe(DEFAULT_TARGETS.length);
    expect(select.options[0].value).toBe('codex');
    expect(select.options[1].value).toBe('claude');
  });

  it('falls back to DEFAULT_TARGETS when agentTargets is missing', () => {
    const select = createElement('target-agent-select', 'select') as HTMLSelectElement;
    populateTargetOptions({ name: 'test-skill' });

    expect(select.options.length).toBe(DEFAULT_TARGETS.length);
  });

  it('uses window.targetProfiles when available', () => {
    const select = createElement('target-agent-select', 'select') as HTMLSelectElement;
    testWindow().targetProfiles = [
      { id: 'codex', label: 'Codex' },
      { id: 'claude', label: 'Claude' },
      { id: 'custom', label: 'Custom Agent' },
    ];

    populateTargetOptions({ name: 'test-skill' });

    expect(select.options.length).toBe(3);
    expect(select.options[2].value).toBe('custom');
    expect(select.options[2].textContent).toBe('Custom Agent');
  });

  it('prefers window.targetProfiles over window.availableTargets', () => {
    const select = createElement('target-agent-select', 'select') as HTMLSelectElement;
    testWindow().targetProfiles = [{ id: 'from-profiles', label: 'From Profiles' }];
    testWindow().availableTargets = [{ id: 'from-available', label: 'From Available' }];

    populateTargetOptions({ name: 'test-skill' });

    expect(select.options.length).toBe(1);
    expect(select.options[0].value).toBe('from-profiles');
  });

  it('does not crash when target-agent-select is missing', () => {
    expect(() =>
      populateTargetOptions({ name: 'test-skill', agentTargets: ['codex'] }),
    ).not.toThrow();
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
  it('emits syntactically valid browser JavaScript', () => {
    expect(() => new Function(controlPanelClientScript)).not.toThrow();
  });

  it('does not use fixed formatMappingStatus with hardcoded codex/claude', () => {
    expect(controlPanelClientScript).not.toContain(
      "formatMappingStatus(s.mappingTargets, 'codex')",
    );
    expect(controlPanelClientScript).not.toContain(
      "formatMappingStatus(s.mappingTargets, 'claude')",
    );
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
    expect(controlPanelClientScript).toContain('activeSkill.name');
    expect(controlPanelClientScript).toContain('window.selectedSkill');
    expect(controlPanelClientScript).not.toContain("getElementById('install-skill')");
  });

  it('contains formatAppliedAgents function for dynamic agent display', () => {
    expect(controlPanelClientScript).toContain('function formatAppliedAgents(');
  });

  it('contains formatAgentTargets function as backward-compatible alias', () => {
    expect(controlPanelClientScript).toContain('function formatAgentTargets(');
  });

  it('contains formatMappingSummary function for mapping overview', () => {
    expect(controlPanelClientScript).toContain('function formatMappingSummary(');
  });

  it('does not contain hardcoded installedClaude or installedCodex counters', () => {
    expect(controlPanelClientScript).not.toContain('installedClaude');
    expect(controlPanelClientScript).not.toContain('installedCodex');
  });

  it('uses targetProfiles for dynamic agent stats in renderStatusSummary', () => {
    expect(controlPanelClientScript).toContain('targetProfiles');
    expect(controlPanelClientScript).toContain('usedByAgent');
  });

  it('appliedAgents and mappingSummary columns appear in discover table', () => {
    expect(controlPanelClientScript).toContain('formatAppliedAgents(s)');
    expect(controlPanelClientScript).toContain('formatMappingSummary(s.mappingSummary)');
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
    'usedByAgent',
    'tableAppliedAgents',
    'tableMappingSummary',
    'tableNumber',
  ];

  const forbiddenKeys = [
    'installedClaude',
    'installedCodex',
    'tableCodexMapping',
    'tableClaudeMapping',
  ];

  for (const key of requiredKeys) {
    it(`en has key "${key}"`, () => {
      expect(translations.en).toHaveProperty(key);
    });
    it(`zh has key "${key}"`, () => {
      expect(translations.zh).toHaveProperty(key);
    });
  }

  for (const key of forbiddenKeys) {
    it(`en does not have hardcoded key "${key}"`, () => {
      expect(translations.en).not.toHaveProperty(key);
    });
    it(`zh does not have hardcoded key "${key}"`, () => {
      expect(translations.zh).not.toHaveProperty(key);
    });
  }
});
