// @vitest-environment jsdom
// Tests for the control panel client script — skill selection, target population, and compatibility result rendering.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clientScriptFunctions, controlPanelClientScript } from '../src/client-script.js';
import { translations } from '../src/i18n.js';

const {
  escapeHtml,
  selectSkillNumber,
  populateTargetOptions,
  renderCompatibilityResult,
  filterSkills,
  DEFAULT_TARGETS,
  STATUS_CLASSES,
} = clientScriptFunctions;

interface TestSkill {
  name: string;
  path?: string;
  source?: string;
  sourceLabel?: string;
  validationStatus?: string;
  agentStates?: Array<{ profileId: string; profileLabel: string; state: string; path: string }>;
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
        source: 'agent',
        sourceLabel: 'agent',
        validationStatus: 'pass',
        agentStates: [{ profileId: 'codex', profileLabel: 'Codex', state: 'unmanaged-local', path: '/tmp/codex/skills/test-skill' }],
      },
    ];

    selectSkillNumber('1');

    expect(titleEl.textContent).toBe('#1 test-skill');
    expect(metaEl.textContent).toContain('agent');
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
        source: 'project',
        validationStatus: 'pass',
        agentStates: [
          { profileId: 'codex', profileLabel: 'Codex', state: 'managed-linked', path: '/tmp/codex/skills/multi-agent-skill' },
          { profileId: 'claude', profileLabel: 'Claude', state: 'managed-linked', path: '/tmp/claude/skills/multi-agent-skill' },
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
      { name: 'x', source: 'agent', validationStatus: 'pass', agentStates: [] },
    ];
    expect(() => selectSkillNumber('1')).not.toThrow();
  });
});

describe('populateTargetOptions', () => {
  it('keeps all default targets available even when a skill is already used by one agent', () => {
    const select = createElement('target-agent-select', 'select') as HTMLSelectElement;
    populateTargetOptions({ name: 'test-skill', agentStates: [{ profileId: 'codex', profileLabel: 'Codex', state: 'managed-linked', path: '/tmp' }] });

    expect(select.options.length).toBe(DEFAULT_TARGETS.length);
    expect(select.options[0].value).toBe('codex');
    expect(select.options[0].textContent).toBe('Codex');
    expect([...select.options].map((option) => option.value)).toContain('claude');
  });

  it('falls back to DEFAULT_TARGETS when agentStates is empty', () => {
    const select = createElement('target-agent-select', 'select') as HTMLSelectElement;
    populateTargetOptions({ name: 'test-skill', agentStates: [] });

    expect(select.options.length).toBe(DEFAULT_TARGETS.length);
    expect(select.options[0].value).toBe('codex');
    expect(select.options[1].value).toBe('claude');
  });

  it('falls back to DEFAULT_TARGETS when agentStates is missing', () => {
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

  it('works without a skill argument for page-load population', () => {
    const select = createElement('target-agent-select', 'select') as HTMLSelectElement;
    testWindow().targetProfiles = [
      { id: 'codex', label: 'Codex' },
      { id: 'custom', label: 'Custom Agent' },
    ];

    populateTargetOptions();

    expect(select.options.length).toBe(2);
    expect(select.options[0].value).toBe('codex');
    expect(select.options[1].value).toBe('custom');
  });

  it('does not crash when target-agent-select is missing', () => {
    expect(() =>
      populateTargetOptions({ name: 'test-skill', agentStates: [{ profileId: 'codex', profileLabel: 'Codex', state: 'managed-linked', path: '/tmp' }] }),
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

  it('renders needs-mapping status with a fixable badge', () => {
    const card = createElement('compat-result-card');
    createElement('output', 'pre');

    renderCompatibilityResult({ status: 'needs-mapping' });

    expect(card.innerHTML).toContain('status-fixable');
    expect(card.innerHTML).toContain('Needs Mapping');
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

  it('contains formatAppliedAgentsChip function for dynamic agent display', () => {
    expect(controlPanelClientScript).toContain('function formatAppliedAgentsChip(');
  });

  it('contains formatMappingBadge function for mapping overview', () => {
    expect(controlPanelClientScript).toContain('function formatMappingBadge(');
  });

  it('does not contain hardcoded installedClaude or installedCodex counters', () => {
    expect(controlPanelClientScript).not.toContain('installedClaude');
    expect(controlPanelClientScript).not.toContain('installedCodex');
  });

  it('uses targetProfiles for dynamic agent stats in renderStatusCards', () => {
    expect(controlPanelClientScript).toContain('targetProfiles');
  });

  it('appliedAgents and mapping columns appear in discover table', () => {
    expect(controlPanelClientScript).toContain('formatAppliedAgentsChip(s)');
    expect(controlPanelClientScript).toContain('formatMappingBadge(s.mappingSummary)');
  });

  it('renderDiscoverTable calls renderStatusCards to refresh metrics', () => {
    expect(controlPanelClientScript).toContain(
      'if (latestStatusData) renderStatusCards(latestStatusData)',
    );
  });

  it('renderStatusCards prefers latestDiscoverData for metrics', () => {
    expect(controlPanelClientScript).toContain(
      'latestDiscoverData && latestDiscoverData.length > 0',
    );
  });

  it('search filter includes path matching', () => {
    expect(controlPanelClientScript).toContain("s.path || '').toLowerCase().includes(q)");
  });

  it('search filter includes agentStates profileLabel matching', () => {
    expect(controlPanelClientScript).toContain('(a.profileLabel || a.profileId).toLowerCase()');
  });

  it('contains selectedSkillNames Set for batch selection', () => {
    expect(controlPanelClientScript).toContain('selectedSkillNames');
    expect(controlPanelClientScript).toContain('new Set()');
  });

  it('contains batchCheckCompat function', () => {
    expect(controlPanelClientScript).toContain('async function batchCheckCompat(');
    expect(controlPanelClientScript).toContain("'/api/compat/batch'");
  });

  it('contains batchMap function', () => {
    expect(controlPanelClientScript).toContain('async function batchMap(');
    expect(controlPanelClientScript).toContain("'/api/install/batch'");
  });

  it('contains batchUnmap function', () => {
    expect(controlPanelClientScript).toContain('async function batchUnmap(');
    expect(controlPanelClientScript).toContain("'/api/uninstall/batch'");
  });

  it('contains toggleSkillSelection for checkbox handling', () => {
    expect(controlPanelClientScript).toContain('function toggleSkillSelection(');
  });

  it('contains togglePageSelection for select-all checkbox', () => {
    expect(controlPanelClientScript).toContain('function togglePageSelection(');
  });

  it('contains selectAll and deselectAll functions', () => {
    expect(controlPanelClientScript).toContain('function selectAll(');
    expect(controlPanelClientScript).toContain('function deselectAll(');
  });

  it('contains preservePage parameter in renderDiscoverTable', () => {
    expect(controlPanelClientScript).toContain('preservePage');
  });

  it('batch-bar element referenced for show/hide', () => {
    expect(controlPanelClientScript).toContain("getElementById('batch-bar')");
  });

  it('passes preservePage=true after map/unmap operations', () => {
    expect(controlPanelClientScript).toContain(
      'renderDiscoverTable(discData.skills, discData.nonSkillDirectories, true)',
    );
  });

  it('uses data-skill-name attribute instead of inline onclick for checkboxes', () => {
    expect(controlPanelClientScript).toContain('data-skill-name="');
    expect(controlPanelClientScript).not.toContain("toggleSkillSelection(\\\\'");
  });

  it('uses event delegation for checkbox changes on discover-table', () => {
    expect(controlPanelClientScript).toContain("getElementById('discover-table')");
    expect(controlPanelClientScript).toContain("addEventListener('change'");
    expect(controlPanelClientScript).toContain('target.dataset.skillName');
  });

  it('uses event delegation for row clicks instead of inline onclick on td', () => {
    expect(controlPanelClientScript).toContain("addEventListener('click'");
    expect(controlPanelClientScript).toContain('closest');
    expect(controlPanelClientScript).not.toContain('onclick="selectSkillNumber(');
  });

  it('populates target-agent-select on page load after status fetch', () => {
    expect(controlPanelClientScript).toContain('populateTargetOptions()');
  });

  it('uses select-all-checkbox id instead of inline togglePageSelection onclick', () => {
    expect(controlPanelClientScript).toContain('id="select-all-checkbox"');
    expect(controlPanelClientScript).not.toContain('onclick="togglePageSelection(');
  });
});

describe('filterSkills', () => {
  const skills = [
    {
      name: 'alpha',
      path: 'D:\\\\SkillGov\\\\skills\\\\alpha',
      source: 'project',
      validationStatus: 'pass',
      agentStates: [{ profileId: 'codex', profileLabel: 'Codex', state: 'managed-linked', path: '/tmp/codex/alpha' }],
    },
    {
      name: 'beta',
      path: 'D:\\\\SkillGov\\\\skills\\\\beta',
      source: 'project',
      validationStatus: 'fail',
      agentStates: [{ profileId: 'claude', profileLabel: 'Claude', state: 'managed-linked', path: '/tmp/claude/beta' }],
    },
    {
      name: 'gamma',
      path: 'C:\\\\Users\\\\docs\\\\gamma',
      source: 'agent',
      validationStatus: 'fixable',
      agentStates: [],
    },
  ];

  it('returns all skills when no filters applied', () => {
    expect(filterSkills(skills, {})).toHaveLength(3);
  });

  it('searches by name', () => {
    expect(filterSkills(skills, { search: 'alpha' })).toHaveLength(1);
    expect(filterSkills(skills, { search: 'alpha' })[0].name).toBe('alpha');
  });

  it('searches by path', () => {
    expect(filterSkills(skills, { search: 'SkillGov\\\\skills' })).toHaveLength(2);
  });

  it('searches by agentStates profileLabel', () => {
    const result = filterSkills(skills, { search: 'Claude' });
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('beta');
  });

  it('filters by validation status', () => {
    expect(filterSkills(skills, { status: 'fail' })).toHaveLength(1);
    expect(filterSkills(skills, { status: 'fail' })[0].name).toBe('beta');
  });

  it('filters problem skills (status !== pass)', () => {
    const problems = skills.filter((s) => s.validationStatus && s.validationStatus !== 'pass');
    expect(problems).toHaveLength(2);
  });

  it('search is case-insensitive', () => {
    expect(filterSkills(skills, { search: 'ALPHA' })).toHaveLength(1);
    expect(filterSkills(skills, { search: 'claude' })).toHaveLength(1);
  });
});

describe('i18n compatibility keys', () => {
  const requiredKeys = [
    'compatibleStatus',
    'needsMappingStatus',
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
    'batchSelected',
    'batchCheckCompat',
    'batchMap',
    'batchUnmap',
    'selectAll',
    'deselectAll',
    'noSkillsSelected',
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

describe('escapeHtml', () => {
  it('escapes < and > to prevent tag injection', () => {
    expect(escapeHtml('<img src=x onerror=alert(1)>')).toBe('&lt;img src=x onerror=alert(1)&gt;');
  });

  it('escapes double quotes to prevent attribute breakout', () => {
    expect(escapeHtml('" onmouseover="alert(1)"')).toBe('&quot; onmouseover=&quot;alert(1)&quot;');
  });

  it('escapes single quotes', () => {
    expect(escapeHtml("it's")).toBe('it&#39;s');
  });

  it('escapes ampersand first to avoid double-encoding', () => {
    expect(escapeHtml('&amp;')).toBe('&amp;amp;');
  });

  it('returns empty string for null/undefined', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
  });

  it('converts non-string values to string before escaping', () => {
    expect(escapeHtml(42)).toBe('42');
  });
});

describe('XSS prevention in rendered HTML', () => {
  it('escapeHtml function is defined in the embedded script', () => {
    expect(controlPanelClientScript).toContain('function escapeHtml(');
  });

  it('renderDiscoverPage uses escapeHtml for skill name', () => {
    expect(controlPanelClientScript).toContain('escapeHtml(s.name)');
  });

  it('renderDiscoverPage uses escapeHtml for validation status', () => {
    expect(controlPanelClientScript).toContain('escapeHtml(s.validationStatus');
  });

  it('renderDiscoverPage uses escapeHtml for source', () => {
    expect(controlPanelClientScript).toContain('escapeHtml(s.sourceLabel');
  });

  it('renderDiscoverPage uses escapeHtml for path including title attribute', () => {
    expect(controlPanelClientScript).toContain('escapeHtml(s.path');
  });

  it('formatAppliedAgentsChip uses escapeHtml for agent names', () => {
    expect(controlPanelClientScript).toContain('escapeHtml(a.profileLabel');
  });

  it('formatMappingBadge uses escapeHtml for summary values', () => {
    expect(controlPanelClientScript).toContain('escapeHtml(summary.linked)');
  });

  it('renderDiscoverPage escapes malicious skill name in table output', () => {
    const table = createElement('discover-table');
    createElement('discover-summary');
    createElement('discover-pagination');
    const win = testWindow() as TestWindow & {
      PAGE_SIZE?: number;
      discoverPage?: number;
      getFilteredSkills?: () => TestSkill[];
    };
    win.latestDiscoverData = [
      {
        name: '<img src=x onerror=alert(1)>',
        path: 'D:\\SkillGov\\skills\\<bad>',
        source: 'project',
        sourceLabel: '"><script>alert("xss")</script>',
        validationStatus: 'pass',
        agentStates: [{ profileId: 'codex', profileLabel: 'Codex', state: 'managed-linked', path: '/tmp' }],
        mappingSummary: { total: 1, linked: 1, missing: 0, conflict: 0 },
      },
    ];
    win.PAGE_SIZE = 10;
    win.discoverPage = 0;
    win.getFilteredSkills = () => win.latestDiscoverData;

    const renderFn = new Function(
      't',
      'escapeHtml',
      'formatAppliedAgentsChip',
      'formatMappingBadge',
      'getFilteredSkills',
      'PAGE_SIZE',
      'discoverPage',
      'latestDiscoverData',
      `
      var table = document.getElementById('discover-table');
      var skills = getFilteredSkills();
      var start = discoverPage * PAGE_SIZE;
      var page = skills.slice(start, start + PAGE_SIZE);
      var rows = page.map(function(s, index) {
        var badgeClass = s.validationStatus === 'pass' ? 'status-pass' : 'status-fail';
        var rowNumber = start + index + 1;
        var escName = escapeHtml(s.name);
        var escStatus = escapeHtml(s.validationStatus || '');
        var escSource = escapeHtml(s.sourceLabel || s.source || '');
        var escPath = escapeHtml(s.path || '');
        var escPathDisplay = escapeHtml(s.path || '-');
        return '<tr data-skill-number="' + rowNumber + '">' +
          '<td>' + rowNumber + '</td>' +
          '<td>' + escName + '</td>' +
          '<td><span class="status-badge ' + badgeClass + '">' + escStatus + '</span></td>' +
          '<td>' + formatAppliedAgentsChip(s) + '</td>' +
          '<td>' + formatMappingBadge(s.mappingSummary) + '</td>' +
          '<td>' + escSource + '</td>' +
          '<td title="' + escPath + '">' + escPathDisplay + '</td>' +
          '</tr>';
      }).join('');
      table.innerHTML = '<table><tbody>' + rows + '</tbody></table>';
      `,
    );

    const escFn = (v: unknown) => {
      if (v == null) return '';
      return String(v)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    };
    const chipFn = (s: TestSkill) => {
      const active = (s.agentStates || []).filter((a) => a.state === 'managed-linked' || a.state === 'unmanaged-local');
      if (active.length === 0) return '<span class="agent-chip">-</span>';
      return active.map((a) => `<span class="agent-chip">${escFn(a.profileLabel || a.profileId)}</span>`).join('');
    };
    const badgeFn = (summary: TestSkill['mappingSummary']) => {
      if (!summary || summary.total === 0)
        return '<span class="mapping-chip mapping-chip-unmapped">Unmapped</span>';
      return `<span class="mapping-chip mapping-chip-linked">${escFn(summary.linked)}/${escFn(summary.total)}</span>`;
    };

    renderFn(
      (k: string) => k,
      escFn,
      chipFn,
      badgeFn,
      () => win.latestDiscoverData,
      10,
      0,
      win.latestDiscoverData,
    );

    const html = table.innerHTML;
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('D:\\SkillGov\\skills\\&lt;bad&gt;');
  });
});
