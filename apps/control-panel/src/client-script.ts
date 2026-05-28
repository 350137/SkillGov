// Browser interaction script string used by the control panel HTML page — console layout with status cards, filters, and skill library.
import { translations } from './i18n.js';

const DEFAULT_TARGETS = [
  { id: 'codex', label: 'Codex' },
  { id: 'claude', label: 'Claude' },
];

const STATUS_CLASSES: Record<string, string> = {
  compatible: 'status-pass',
  'needs-overlay': 'status-fixable',
  unsupported: 'status-fail',
};

interface BrowserSkill {
  name: string;
  path?: string;
  source?: string;
  sourceLabel?: string;
  validationStatus?: string;
  agentTargets?: string[];
  appliedAgents?: Array<{ id: string; label: string; source: string }>;
  mappingSummary?: { total: number; linked: number; missing: number; conflict: number };
}

interface BrowserTarget {
  id: string;
  label: string;
  skillDirs?: string[];
  linkMode?: string;
}

declare global {
  interface Window {
    selectedSkill: BrowserSkill | null;
    targetProfiles?: BrowserTarget[];
    availableTargets?: BrowserTarget[];
    t: (key: string) => string;
    resolveSkillByNumber: (value: string) => BrowserSkill | null;
    populateTargetOptions: (skill: BrowserSkill) => void;
    renderCompatibilityResult: (data: Record<string, unknown>) => void;
    handleExport: () => void;
  }
}

export function escapeHtmlBody(value: unknown): string {
  if (value == null) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function selectSkillNumberBody(value: string): void {
  const skill = window.resolveSkillByNumber(value);
  const titleEl = document.getElementById('selected-skill-title');
  const metaEl = document.getElementById('selected-skill-meta');
  if (!skill) {
    window.selectedSkill = null;
    if (titleEl) titleEl.textContent = window.t('noSkillSelected');
    if (metaEl) metaEl.textContent = '';
    return;
  }
  window.selectedSkill = skill;
  const number = Number.parseInt(value, 10);
  if (titleEl) titleEl.textContent = `#${number} ${skill.name}`;
  if (metaEl) {
    const parts = [skill.sourceLabel || skill.source, skill.validationStatus];
    const agents =
      skill.appliedAgents && skill.appliedAgents.length > 0
        ? skill.appliedAgents.map((a) => a.label || a.id)
        : skill.agentTargets || [];
    if (agents.length > 0) {
      parts.push(agents.join(', '));
    }
    metaEl.textContent = parts.join(' · ');
  }
  window.populateTargetOptions(skill);
}

function populateTargetOptionsBody(_skill: BrowserSkill): void {
  const select = document.getElementById('target-agent-select');
  if (!select) return;
  const targets =
    Array.isArray(window.targetProfiles) && window.targetProfiles.length > 0
      ? window.targetProfiles
      : Array.isArray(window.availableTargets) && window.availableTargets.length > 0
        ? window.availableTargets
        : DEFAULT_TARGETS;
  select.innerHTML = '';
  for (const target of targets) {
    const option = document.createElement('option');
    option.value = target.id;
    option.textContent = target.label;
    select.appendChild(option);
  }
}

const escapeHtml = escapeHtmlBody;

function renderCompatibilityResultBody(data: Record<string, unknown>): void {
  const card = document.getElementById('compat-result-card');
  const output = document.getElementById('output');
  if (card) {
    const status = (data.status as string) || 'unknown';
    const badgeClass = STATUS_CLASSES[status] || 'status-fail';
    const statusKey = `${status}Status`;
    const statusLabel = window.t(statusKey) || status;
    let html = '<div class="compat-card">';
    html += `<span class="status-badge ${badgeClass}">${escapeHtml(statusLabel)}</span>`;
    if (data.reason) {
      html += `<p class="compat-reason">${escapeHtml(data.reason)}</p>`;
    }
    if (data.suggestedAction) {
      html += `<p class="compat-action"><strong>${escapeHtml(window.t('checkButton'))}:</strong> ${escapeHtml(data.suggestedAction)}</p>`;
    }
    const issues = data.issues as Array<{ severity: string; message: string }> | undefined;
    if (issues && issues.length > 0) {
      html += `<p class="compat-reason">${window.t('compatIssues').replace('{count}', String(issues.length))}</p>`;
      html += '<ul class="compat-issues-list">';
      for (const issue of issues) {
        html += `<li><span class="status-badge status-${issue.severity === 'error' ? 'fail' : issue.severity === 'warning' ? 'fixable' : 'pass'}">${escapeHtml(issue.severity)}</span> ${escapeHtml(issue.message)}</li>`;
      }
      html += '</ul>';
    } else if (status === 'compatible') {
      html += `<p class="compat-reason">${window.t('compatNoIssues')}</p>`;
    }
    html += '</div>';
    card.innerHTML = html;
  }
  if (output) {
    output.textContent = JSON.stringify(data, null, 2);
  }
}

async function checkSelectedCompatibilityBody(): Promise<void> {
  const selectedSkill = window.selectedSkill;
  const targetSelect = document.getElementById('target-agent-select');
  const output = document.getElementById('output');
  if (!selectedSkill) {
    if (output) output.textContent = window.t('noSkillSelected');
    return;
  }
  const target = targetSelect ? targetSelect.value : '';
  if (!target) {
    if (output) output.textContent = window.t('noTargetAvailable');
    return;
  }
  if (output) output.textContent = window.t('loading');
  try {
    const res = await fetch('/api/compat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ skillPath: selectedSkill.path, target }),
    });
    const data = await res.json();
    window.renderCompatibilityResult(data);
  } catch (err) {
    if (output) output.textContent = window.t('errorPrefix') + (err as Error).message;
  }
}

export interface FilterOptions {
  search?: string;
  status?: string;
  source?: string;
  mapping?: string;
  agent?: string;
}

export function filterSkillsBody(skills: BrowserSkill[], opts: FilterOptions): BrowserSkill[] {
  let result = skills || [];
  if (opts.search) {
    const q = opts.search.toLowerCase();
    result = result.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        (s.path || '').toLowerCase().includes(q) ||
        (s.sourceLabel || s.source || '').toLowerCase().includes(q) ||
        (s.appliedAgents || []).some((a) => (a.label || a.id).toLowerCase().includes(q)),
    );
  }
  if (opts.status) {
    result = result.filter((s) => s.validationStatus === opts.status);
  }
  if (opts.source) {
    result = result.filter((s) => (s.sourceLabel || s.source) === opts.source);
  }
  if (opts.mapping) {
    result = result.filter((s) => {
      const ms = s.mappingSummary;
      if (opts.mapping === 'unmapped') return !ms || ms.total === 0;
      if (opts.mapping === 'linked')
        return ms && ms.linked > 0 && ms.missing === 0 && ms.conflict === 0;
      if (opts.mapping === 'missing') return ms && ms.missing > 0;
      if (opts.mapping === 'conflict') return ms && ms.conflict > 0;
      return true;
    });
  }
  if (opts.agent) {
    result = result.filter((s) => {
      const targets = s.agentTargets || [];
      const applied = (s.appliedAgents || []).map((a) => a.id);
      return targets.includes(opts.agent) || applied.includes(opts.agent);
    });
  }
  return result;
}

function extractFunctionBody(fn: (...args: never[]) => unknown): string {
  return fn
    .toString()
    .replace(/^(?:async\s+)?function\s*\w*\s*\([^)]*\)\s*\{/, '')
    .replace(/\}$/, '');
}

const clientScriptBody = `
let currentLanguage = 'en';
let latestStatusData = null;
let selectedSkill = null;

const DEFAULT_TARGETS = ${JSON.stringify(DEFAULT_TARGETS)};
const STATUS_CLASSES = ${JSON.stringify(STATUS_CLASSES)};

function escapeHtml(value) {
  if (value == null) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Filter state
let filterSearch = '';
let filterStatus = '';
let filterSource = '';
let filterMapping = '';
let filterAgent = '';

function getPreferredLanguage() {
  const stored = localStorage.getItem('skillgov-language');
  if (stored === 'zh' || stored === 'en') return stored;
  return navigator.language && navigator.language.toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

function t(key) {
  return translations[currentLanguage][key] || translations.en[key] || key;
}

function applyLanguage(language) {
  currentLanguage = language === 'zh' ? 'zh' : 'en';
  localStorage.setItem('skillgov-language', currentLanguage);
  document.documentElement.lang = currentLanguage === 'zh' ? 'zh-CN' : 'en';
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
    el.setAttribute('placeholder', t(el.dataset.i18nPlaceholder));
  });
  const select = document.getElementById('language-select');
  if (select) select.value = currentLanguage;
}

let discoverPage = 0;
const PAGE_SIZE = 10;
let latestDiscoverData = [];
let latestNonSkillDirectories = [];

function renderStatusCards(data) {
  latestStatusData = data;
  if (Array.isArray(data.targetProfiles)) {
    window.targetProfiles = data.targetProfiles;
  }
  const el = document.getElementById('status-cards');
  if (!el) return;
  const profiles = Array.isArray(data.targetProfiles) ? data.targetProfiles : (window.targetProfiles || []);

  // Prefer discover data for metrics when available (has complete validationStatus)
  const useDiscover = latestDiscoverData && latestDiscoverData.length > 0;
  const metricSkills = useDiscover ? latestDiscoverData : (data.skills || []);
  const appliedCount = useDiscover
    ? metricSkills.filter((s) => s.appliedAgents && s.appliedAgents.length > 0).length
    : metricSkills.filter((s) => s.installedTargets && s.installedTargets.length > 0).length;
  const problemCount = metricSkills.filter((s) => s.validationStatus && s.validationStatus !== 'pass').length;
  const excludedCount = useDiscover ? latestNonSkillDirectories.length : (data.nonSkillDirectories || []).length;

  const cards = [
    { value: metricSkills.length, label: t('metricTotal') || t('totalManaged') },
    { value: appliedCount, label: t('metricApplied') },
    { value: problemCount, label: t('metricProblem') },
    { value: excludedCount, label: t('metricNonSkill') || t('excludedDirectories') },
  ];

  el.innerHTML = cards.map((c) =>
    '<div class="stat-card"><div class="stat-value">' + c.value + '</div><div class="stat-label">' + c.label + '</div></div>'
  ).join('');

  // Populate agent filter
  populateAgentFilter(profiles);
  // Populate source filter
  populateSourceFilter(latestDiscoverData);
}

function populateAgentFilter(profiles) {
  const select = document.getElementById('skill-agent-filter');
  if (!select) return;
  const currentValue = select.value;
  // Keep the "all" option
  select.innerHTML = '<option value="">' + t('allAgents') + '</option>';
  for (const p of profiles) {
    const option = document.createElement('option');
    option.value = p.id;
    option.textContent = p.label || p.id;
    select.appendChild(option);
  }
  select.value = currentValue;
}

function populateSourceFilter(skills) {
  const select = document.getElementById('skill-source-filter');
  if (!select) return;
  const currentValue = select.value;
  const sources = new Set();
  for (const s of (skills || [])) {
    if (s.sourceLabel || s.source) sources.add(s.sourceLabel || s.source);
  }
  select.innerHTML = '<option value="">' + t('allSources') + '</option>';
  for (const src of [...sources].sort()) {
    const option = document.createElement('option');
    option.value = src;
    option.textContent = src;
    select.appendChild(option);
  }
  select.value = currentValue;
}

function getFilteredSkills() {
  let skills = latestDiscoverData || [];
  if (filterSearch) {
    const q = filterSearch.toLowerCase();
    skills = skills.filter((s) =>
      s.name.toLowerCase().includes(q) ||
      (s.path || '').toLowerCase().includes(q) ||
      (s.sourceLabel || s.source || '').toLowerCase().includes(q) ||
      ((s.appliedAgents || []).some((a) => (a.label || a.id).toLowerCase().includes(q)))
    );
  }
  if (filterStatus) {
    skills = skills.filter((s) => s.validationStatus === filterStatus);
  }
  if (filterSource) {
    skills = skills.filter((s) => (s.sourceLabel || s.source) === filterSource);
  }
  if (filterMapping) {
    skills = skills.filter((s) => {
      const ms = s.mappingSummary;
      if (filterMapping === 'unmapped') return !ms || ms.total === 0;
      if (filterMapping === 'linked') return ms && ms.linked > 0 && ms.missing === 0 && ms.conflict === 0;
      if (filterMapping === 'missing') return ms && ms.missing > 0;
      if (filterMapping === 'conflict') return ms && ms.conflict > 0;
      return true;
    });
  }
  if (filterAgent) {
    skills = skills.filter((s) => {
      const targets = s.agentTargets || [];
      const applied = (s.appliedAgents || []).map((a) => a.id);
      return targets.includes(filterAgent) || applied.includes(filterAgent);
    });
  }
  return skills;
}

function renderDiscoverTable(skills, nonSkillDirectories) {
  latestDiscoverData = skills || [];
  latestNonSkillDirectories = nonSkillDirectories || [];
  discoverPage = 0;
  populateSourceFilter(latestDiscoverData);
  renderDiscoverPage();
  // Refresh status cards with discover data for accurate metrics
  if (latestStatusData) renderStatusCards(latestStatusData);
}

function formatAppliedAgents(skill) {
  if (skill.appliedAgents && skill.appliedAgents.length > 0) {
    return skill.appliedAgents.map((a) => a.label || a.id).join(', ');
  }
  const labels = { codex: 'Codex', claude: 'Claude' };
  const targets = skill.agentTargets;
  if (!targets || targets.length === 0) return t('none');
  return targets.map((target) => labels[target] || target).join(', ');
}

function formatAppliedAgentsChip(skill) {
  const agents = skill.appliedAgents && skill.appliedAgents.length > 0
    ? skill.appliedAgents.map((a) => a.label || a.id)
    : skill.agentTargets || [];
  if (agents.length === 0) return '<span class="agent-chip">' + escapeHtml(t('none')) + '</span>';
  return agents.map((a) => '<span class="agent-chip">' + escapeHtml(a) + '</span>').join('');
}

function formatMappingBadge(summary) {
  if (!summary || summary.total === 0) return '<span class="mapping-chip mapping-chip-unmapped">' + escapeHtml(t('mappingStatusUnmapped')) + '</span>';
  if (summary.conflict > 0) return '<span class="mapping-chip mapping-chip-conflict">' + escapeHtml(t('mappingStatusConflict')) + '</span>';
  if (summary.missing > 0) return '<span class="mapping-chip mapping-chip-unmapped">' + escapeHtml(summary.linked) + '/' + escapeHtml(summary.total) + '</span>';
  return '<span class="mapping-chip mapping-chip-linked">' + escapeHtml(summary.linked) + '/' + escapeHtml(summary.total) + '</span>';
}

function resolveSkillByNumber(value) {
  const filtered = getFilteredSkills();
  const number = Number.parseInt(value, 10);
  if (!Number.isInteger(number) || number < 1 || number > filtered.length) return null;
  return filtered[number - 1];
}

function selectSkillNumber(value) {
  ${extractFunctionBody(selectSkillNumberBody)}
}

function populateTargetOptions(skill) {
  ${extractFunctionBody(populateTargetOptionsBody)}
}

function renderCompatibilityResult(data) {
  ${extractFunctionBody(renderCompatibilityResultBody)}
}

async function checkSelectedCompatibility() {
  ${extractFunctionBody(checkSelectedCompatibilityBody)}
}

function handleExport() {
  const output = document.getElementById('output');
  if (output) output.textContent = t('exportNotImplemented');
}

function renderDiscoverPage() {
  const skills = getFilteredSkills();
  const allSkills = latestDiscoverData;
  const summary = document.getElementById('discover-summary');
  const table = document.getElementById('discover-table');
  const pagination = document.getElementById('discover-pagination');

  if (summary) summary.innerHTML = '';

  if (!allSkills || allSkills.length === 0) {
    if (table) table.innerHTML = '<p>' + t('noSkills') + '</p>';
    if (pagination) pagination.innerHTML = '';
    return;
  }

  const totalPages = Math.ceil(skills.length / PAGE_SIZE);

  if (skills.length === 0) {
    if (table) table.innerHTML = '<p>' + t('noSkills') + '</p>';
    if (pagination) pagination.innerHTML = '';
    return;
  }

  const start = discoverPage * PAGE_SIZE;
  const page = skills.slice(start, start + PAGE_SIZE);
  const rows = page.map((s, index) => {
    const badgeClass = s.validationStatus === 'pass' ? 'status-pass' : s.validationStatus === 'fixable' ? 'status-fixable' : 'status-fail';
    const rowNumber = start + index + 1;
    const escName = escapeHtml(s.name);
    const escStatus = escapeHtml(s.validationStatus || '');
    const escSource = escapeHtml(s.sourceLabel || s.source || '');
    const escPath = escapeHtml(s.path || '');
    const escPathDisplay = escapeHtml(s.path || '-');
    return '<tr data-skill-number="' + rowNumber + '" onclick="selectSkillNumber(\\'' + rowNumber + '\\')" style="cursor:pointer;">' +
      '<td>' + rowNumber + '</td>' +
      '<td>' + escName + '</td>' +
      '<td><span class="status-badge ' + badgeClass + '">' + escStatus + '</span></td>' +
      '<td>' + formatAppliedAgentsChip(s) + '</td>' +
      '<td>' + formatMappingBadge(s.mappingSummary) + '</td>' +
      '<td>' + escSource + '</td>' +
      '<td style="max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="' + escPath + '">' + escPathDisplay + '</td>' +
      '</tr>';
  }).join('');
  if (table) {
    table.innerHTML = '<table><thead><tr>' +
      '<th>' + t('tableNumber') + '</th>' +
      '<th>' + t('tableSkill') + '</th>' +
      '<th>' + t('tableStatus') + '</th>' +
      '<th>' + t('tableAppliedAgentsChip') + '</th>' +
      '<th>' + t('tableMappingStatus') + '</th>' +
      '<th>' + t('tableSourceLabel') + '</th>' +
      '<th>' + t('tablePathLabel') + '</th>' +
      '</tr></thead><tbody>' + rows + '</tbody></table>';
  }

  const pageInfo = t('pageInfo').replace('{current}', discoverPage + 1).replace('{total}', totalPages || 1);
  if (pagination) {
    pagination.innerHTML = '<div style="display:flex;gap:8px;align-items:center;margin-top:8px;">' +
      '<button onclick="changeDiscoverPage(-1)" ' + (discoverPage === 0 ? 'disabled' : '') + '>' + t('prevPage') + '</button>' +
      '<span>' + pageInfo + '</span>' +
      '<button onclick="changeDiscoverPage(1)" ' + (discoverPage >= totalPages - 1 ? 'disabled' : '') + '>' + t('nextPage') + '</button>' +
      '<span style="margin-left:12px;color:#888;">' + t('pageInfoTotal').replace('{total}', skills.length) + '</span>' +
      '</div>';
  }
}

function changeDiscoverPage(delta) {
  const filtered = getFilteredSkills();
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  discoverPage = Math.max(0, Math.min(totalPages - 1, discoverPage + delta));
  renderDiscoverPage();
}

async function callAPI(endpoint) {
  const output = document.getElementById('output');
  if (output) output.textContent = t('loading');

  const body = {};

  if (endpoint === 'compat') {
    await checkSelectedCompatibility();
    return;
  }

  if (endpoint === 'install' || endpoint === 'uninstall') {
    const activeSkill = window.selectedSkill || selectedSkill;
    if (!activeSkill) {
      if (output) output.textContent = t('noSkillSelected');
      return;
    }
    const targetSelect = document.getElementById('target-agent-select');
    const target = targetSelect ? targetSelect.value : '';
    if (!target) {
      if (output) output.textContent = t('noTargetAvailable');
      return;
    }
    body.skillName = activeSkill.name;
    body.target = target;
  }

  if (endpoint === 'map') {
    await callAPI('install');
    return;
  }
  if (endpoint === 'unmap') {
    await callAPI('uninstall');
    return;
  }

  if (endpoint === 'doctor' || endpoint === 'rollback') {
    const targetSelect = document.getElementById('target-agent-select');
    if (endpoint === 'rollback' && targetSelect) {
      body.target = targetSelect.value;
    }
  }

  try {
    const res = await fetch('/api/' + endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (output) output.textContent = JSON.stringify(data, null, 2);
    if (endpoint === 'status') {
      latestStatusData = data;
      renderStatusCards(data);
    }
    if (endpoint === 'discover' && data.skills) {
      renderDiscoverTable(data.skills, data.nonSkillDirectories);
    }
    if (endpoint === 'discover/import' && data.results) {
      callAPI('discover');
    }
    if (endpoint === 'install' || endpoint === 'uninstall') {
      fetch('/api/status', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
        .then((r) => r.json())
        .then((statusData) => { renderStatusCards(statusData); })
        .catch(() => {});
      fetch('/api/discover', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
        .then((r) => r.json())
        .then((discData) => { if (discData.skills) renderDiscoverTable(discData.skills, discData.nonSkillDirectories); })
        .catch(() => {});
    }
  } catch (err) {
    if (output) output.textContent = t('errorPrefix') + err.message;
  }
}

window.handleExport = handleExport;

window.addEventListener('DOMContentLoaded', () => {
  applyLanguage(getPreferredLanguage());
  document.getElementById('language-select')?.addEventListener('change', (event) => {
    applyLanguage(event.target.value);
    if (latestStatusData) renderStatusCards(latestStatusData);
    if (latestDiscoverData.length > 0) renderDiscoverPage();
  });

  // Wire up search and filters
  const searchInput = document.getElementById('skill-search-input');
  if (searchInput) {
    searchInput.addEventListener('input', (event) => {
      filterSearch = event.target.value || '';
      discoverPage = 0;
      renderDiscoverPage();
    });
  }
  const statusFilter = document.getElementById('skill-status-filter');
  if (statusFilter) {
    statusFilter.addEventListener('change', (event) => {
      filterStatus = event.target.value || '';
      discoverPage = 0;
      renderDiscoverPage();
    });
  }
  const sourceFilter = document.getElementById('skill-source-filter');
  if (sourceFilter) {
    sourceFilter.addEventListener('change', (event) => {
      filterSource = event.target.value || '';
      discoverPage = 0;
      renderDiscoverPage();
    });
  }
  const mappingFilter = document.getElementById('skill-mapping-filter');
  if (mappingFilter) {
    mappingFilter.addEventListener('change', (event) => {
      filterMapping = event.target.value || '';
      discoverPage = 0;
      renderDiscoverPage();
    });
  }
  const agentFilter = document.getElementById('skill-agent-filter');
  if (agentFilter) {
    agentFilter.addEventListener('change', (event) => {
      filterAgent = event.target.value || '';
      discoverPage = 0;
      renderDiscoverPage();
    });
  }

  const searchParams = new URLSearchParams(window.location.search);
  const pp = document.getElementById('project-path');
  fetch('/api/status')
    .then(r => r.json())
    .then(data => {
      if (pp) pp.textContent = data.projectRoot || t('noProject');
      if (Array.isArray(data.targetProfiles)) {
        window.targetProfiles = data.targetProfiles;
      }
      renderStatusCards(data);
      if (searchParams.get('discover') === '1') callAPI('discover');
    })
    .catch(() => { if (pp) pp.textContent = t('statusLoadFailed'); });
});
`;

export const controlPanelClientScript = `const translations = ${JSON.stringify(translations, null, 2)};\n\n${clientScriptBody}`;

export const clientScriptFunctions = {
  escapeHtml: escapeHtmlBody,
  selectSkillNumber: selectSkillNumberBody,
  populateTargetOptions: populateTargetOptionsBody,
  renderCompatibilityResult: renderCompatibilityResultBody,
  checkSelectedCompatibility: checkSelectedCompatibilityBody,
  filterSkills: filterSkillsBody,
  DEFAULT_TARGETS,
  STATUS_CLASSES,
};
