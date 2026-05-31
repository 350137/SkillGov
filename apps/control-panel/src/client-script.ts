// Browser interaction script string used by the control panel HTML page — console layout with status cards, filters, and skill library.
import { translations } from './i18n.js';

const DEFAULT_TARGETS = [
  { id: 'codex', label: 'Codex' },
  { id: 'claude', label: 'Claude' },
];

const STATUS_CLASSES: Record<string, string> = {
  compatible: 'status-pass',
  'needs-mapping': 'status-fixable',
  'needs-overlay': 'status-fixable',
  unsupported: 'status-fail',
};

const STATUS_LABEL_KEYS: Record<string, string> = {
  compatible: 'compatibleStatus',
  'needs-mapping': 'needsMappingStatus',
  'needs-overlay': 'needsOverlayStatus',
  unsupported: 'unsupportedStatus',
  unknown: 'unknownStatus',
};

interface BrowserSkill {
  name: string;
  path?: string;
  source?: string;
  sourceLabel?: string;
  displayDescription?: {
    zh?: string;
    en?: string;
    fallback?: string;
    resolvedZh?: string;
    resolvedEn?: string;
    reviewStatus?: string;
    source?: string;
  };
  validationStatus?: string;
  agentStates?: Array<{ profileId: string; profileLabel: string; state: string; path: string }>;
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
  if (typeof selectedSkillNames !== 'undefined') selectedSkillNames.clear();
  if (!skill) {
    window.selectedSkill = null;
    if (titleEl) titleEl.textContent = window.t('noSkillSelected');
    if (metaEl) metaEl.textContent = '';
    if (typeof updatePanelVisibility === 'function') updatePanelVisibility();
    return;
  }
  window.selectedSkill = skill;
  const number = Number.parseInt(value, 10);
  if (titleEl) titleEl.textContent = `#${number} ${skill.name}`;
  if (metaEl) {
    const parts = [skill.sourceLabel || skill.source, skill.validationStatus];
    const agents = (skill.agentStates || [])
      .filter((s) => s.state === 'managed-linked' || s.state === 'unmanaged-local')
      .map((s) => s.profileLabel || s.profileId);
    if (agents.length > 0) {
      parts.push(agents.join(', '));
    }
    metaEl.textContent = parts.join(' · ');
  }
  window.populateTargetOptions(skill);
  if (typeof updatePanelVisibility === 'function') updatePanelVisibility();
  if (typeof renderDiscoverPage === 'function') renderDiscoverPage();
}

function populateTargetOptionsBody(_skill?: BrowserSkill): void {
  const targets =
    Array.isArray(window.targetProfiles) && window.targetProfiles.length > 0
      ? window.targetProfiles
      : Array.isArray(window.availableTargets) && window.availableTargets.length > 0
        ? window.availableTargets
        : DEFAULT_TARGETS;
  for (const selectId of ['target-agent-select', 'target-agent-select-multi']) {
    const select = document.getElementById(selectId);
    if (!select) continue;
    select.innerHTML = '';
    for (const target of targets) {
      const option = document.createElement('option');
      option.value = target.id;
      option.textContent = target.label;
      select.appendChild(option);
    }
  }
}

const escapeHtml = escapeHtmlBody;

function resolveSkillDisplayDescriptionBody(skill: BrowserSkill, language = 'en'): string {
  const description = skill.displayDescription || {};
  if (language === 'zh') {
    return description.zh || description.en || description.fallback || '';
  }
  return description.en || description.zh || description.fallback || '';
}

function renderCompatibilityResultBody(data: Record<string, unknown>): void {
  const card = document.getElementById('compat-result-card');
  const output = document.getElementById('output');
  if (card) {
    const status = (data.status as string) || 'unknown';
    const badgeClass = STATUS_CLASSES[status] || 'status-fail';
    const statusKey = STATUS_LABEL_KEYS[status] || `${status}Status`;
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
        resolveSkillDisplayDescriptionBody(s).toLowerCase().includes(q) ||
        (s.agentStates || []).some((a) =>
          (a.profileLabel || a.profileId).toLowerCase().includes(q),
        ),
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
      const states = s.agentStates || [];
      return states.some((a) => a.profileId === opts.agent);
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
let libraryView = 'status';

const DEFAULT_TARGETS = ${JSON.stringify(DEFAULT_TARGETS)};
const STATUS_CLASSES = ${JSON.stringify(STATUS_CLASSES)};
const STATUS_LABEL_KEYS = ${JSON.stringify(STATUS_LABEL_KEYS)};

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

// Batch selection state
const selectedSkillNames = new Set();

function updatePanelVisibility() {
  const noSel = document.getElementById('panel-no-selection');
  const single = document.getElementById('panel-single');
  const multi = document.getElementById('panel-multi');
  const count = selectedSkillNames.size;

  if (count > 1) {
    if (noSel) noSel.style.display = 'none';
    if (single) single.style.display = 'none';
    if (multi) multi.style.display = '';
    const countEl = document.getElementById('panel-multi-count');
    if (countEl) countEl.textContent = t('batchSelected').replace('{count}', count);
  } else if (count === 1) {
    if (noSel) noSel.style.display = 'none';
    if (single) single.style.display = '';
    if (multi) multi.style.display = 'none';
    const name = [...selectedSkillNames][0];
    const skill = (latestDiscoverData || []).find(function(s) { return s.name === name; });
    if (skill) {
      window.selectedSkill = skill;
      const titleEl = document.getElementById('selected-skill-title');
      const metaEl = document.getElementById('selected-skill-meta');
      if (titleEl) titleEl.textContent = skill.name;
      if (metaEl) {
        var parts = [skill.sourceLabel || skill.source, skill.validationStatus];
        var agents = (skill.agentStates || [])
          .filter(function(s) { return s.state === 'managed-linked' || s.state === 'unmanaged-local'; })
          .map(function(s) { return s.profileLabel || s.profileId; });
        if (agents.length > 0) parts.push(agents.join(', '));
        metaEl.textContent = parts.join(' · ');
      }
      window.populateTargetOptions(skill);
    }
  } else {
    if (window.selectedSkill) {
      if (noSel) noSel.style.display = 'none';
      if (single) single.style.display = '';
      if (multi) multi.style.display = 'none';
    } else {
      if (noSel) noSel.style.display = '';
      if (single) single.style.display = 'none';
      if (multi) multi.style.display = 'none';
    }
  }
}

function toggleSkillSelection(name, checked) {
  if (checked) selectedSkillNames.add(name);
  else selectedSkillNames.delete(name);
  updatePanelVisibility();
}

function selectAll() {
  const filtered = getFilteredSkills();
  for (const s of filtered) selectedSkillNames.add(s.name);
  updatePanelVisibility();
  renderDiscoverPage();
}

function deselectAll() {
  selectedSkillNames.clear();
  window.selectedSkill = null;
  updatePanelVisibility();
  renderDiscoverPage();
}

function togglePageSelection(checked) {
  const filtered = getFilteredSkills();
  const start = discoverPage * PAGE_SIZE;
  const page = filtered.slice(start, start + PAGE_SIZE);
  for (const s of page) {
    if (checked) selectedSkillNames.add(s.name);
    else selectedSkillNames.delete(s.name);
  }
  updatePanelVisibility();
  renderDiscoverPage();
}

function getStatusBadgeClass(status) {
  if (STATUS_CLASSES[status]) return STATUS_CLASSES[status];
  if (['mapped', 'already-mapped', 'unmapped', 'adopted', 'already-linked', 'compatible'].indexOf(status) >= 0) return 'status-pass';
  if (['not-found', 'needs-mapping', 'needs-overlay'].indexOf(status) >= 0) return 'status-fixable';
  return 'status-fail';
}

function renderResultStat(value, label, variant) {
  return '<div class="result-stat' + (variant ? ' ' + variant : '') + '">' +
    '<div class="result-stat-value">' + value + '</div>' +
    '<div class="result-stat-label">' + escapeHtml(label) + '</div>' +
    '</div>';
}

function renderBatchResult(data, operationType, target) {
  const results = data.results || [];
  const summary = data.summary || null;
  const total = summary ? summary.total : (data.total || results.length);
  const headerKeys = { compat: 'batchCheckCompat', map: 'batchMap', unmap: 'batchUnmap', adopt: 'batchAdopt' };

  let html = '<div class="result-card">';
  html += '<div class="result-header">';
  html += '<span class="result-operation">' + escapeHtml(t(headerKeys[operationType] || operationType)) + '</span>';
  if (target) html += '<span class="result-target">' + escapeHtml(t('resultTarget')) + ': ' + escapeHtml(target) + '</span>';
  html += '</div>';

  html += '<div class="result-stats">';
  html += renderResultStat(total, t('resultTotal'), '');

  if (operationType === 'compat') {
    const compatible = results.filter(function(r) { return r.status === 'compatible'; }).length;
    const needsMapping = results.filter(function(r) { return r.status === 'needs-mapping' || r.status === 'needs-overlay'; }).length;
    const unsupported = results.filter(function(r) { return r.status === 'unsupported'; }).length;
    const errors = results.filter(function(r) { return r.status === 'error'; }).length;
    html += renderResultStat(compatible, t('compatibleStatus'), 'stat-success');
    html += renderResultStat(needsMapping, t('needsMappingStatus'), 'stat-warning');
    html += renderResultStat(unsupported, t('unsupportedStatus'), 'stat-error');
    if (errors > 0) html += renderResultStat(errors, t('resultFailed'), 'stat-error');
  } else if (operationType === 'map') {
    html += renderResultStat(summary.mapped || 0, t('resultSuccess'), 'stat-success');
    if (summary.alreadyMapped) html += renderResultStat(summary.alreadyMapped, t('resultAlready'), 'stat-muted');
    if (summary.notFound) html += renderResultStat(summary.notFound, t('resultNotFound'), 'stat-warning');
    if (summary.blocked) html += renderResultStat(summary.blocked, t('resultBlocked'), 'stat-error');
    if (summary.errors) html += renderResultStat(summary.errors, t('resultFailed'), 'stat-error');
  } else if (operationType === 'unmap') {
    html += renderResultStat(summary.unmapped || 0, t('resultSuccess'), 'stat-success');
    if (summary.notFound) html += renderResultStat(summary.notFound, t('resultNotFound'), 'stat-warning');
    if (summary.refused) html += renderResultStat(summary.refused, t('resultBlocked'), 'stat-error');
    if (summary.errors) html += renderResultStat(summary.errors, t('resultFailed'), 'stat-error');
  } else if (operationType === 'adopt') {
    html += renderResultStat(summary.adopted || 0, t('resultSuccess'), 'stat-success');
    if (summary.alreadyLinked) html += renderResultStat(summary.alreadyLinked, t('resultAlready'), 'stat-muted');
    if (summary.notFound) html += renderResultStat(summary.notFound, t('resultNotFound'), 'stat-warning');
    if (summary.blocked) html += renderResultStat(summary.blocked, t('resultBlocked'), 'stat-error');
    if (summary.errors) html += renderResultStat(summary.errors, t('resultFailed'), 'stat-error');
  }

  html += '</div>';

  if (results.length > 0) {
    html += '<table class="result-table"><thead><tr>';
    html += '<th>' + t('tableSkill') + '</th>';
    html += '<th>' + t('tableStatus') + '</th>';
    html += '<th>' + t('resultMessage') + '</th>';
    html += '</tr></thead><tbody>';
    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      const badgeClass = getStatusBadgeClass(r.status);
      html += '<tr>';
      html += '<td>' + escapeHtml(r.name) + '</td>';
      html += '<td><span class="status-badge ' + badgeClass + '">' + escapeHtml(r.status) + '</span></td>';
      html += '<td>' + escapeHtml(r.message || r.error || '') + '</td>';
      html += '</tr>';
    }
    html += '</tbody></table>';
  }

  html += '</div>';
  return html;
}

function renderSingleResult(data, operationType) {
  const status = data.status || 'unknown';
  const badgeClass = getStatusBadgeClass(status);

  let html = '<div class="result-card">';
  html += '<div class="result-header">';
  html += '<span class="status-badge ' + badgeClass + '">' + escapeHtml(status) + '</span>';
  html += '</div>';

  if (data.message) {
    html += '<p class="result-message">' + escapeHtml(data.message) + '</p>';
  }

  html += '</div>';
  return html;
}

function showBatchResult(data, operationType, target) {
  const resultDisplay = document.getElementById('result-display');
  const output = document.getElementById('output');
  if (resultDisplay) resultDisplay.innerHTML = renderBatchResult(data, operationType, target);
  if (output) output.textContent = JSON.stringify(data, null, 2);
}

function showSingleResult(data, operationType) {
  const resultDisplay = document.getElementById('result-display');
  const output = document.getElementById('output');
  if (resultDisplay) resultDisplay.innerHTML = renderSingleResult(data, operationType);
  if (output) output.textContent = JSON.stringify(data, null, 2);
}

async function batchCheckCompat() {
  const output = document.getElementById('output');
  const targetSelect = document.getElementById('target-agent-select-multi');
  const target = targetSelect ? targetSelect.value : '';
  if (!target) {
    if (output) output.textContent = t('noTargetAvailable');
    return;
  }
  if (selectedSkillNames.size === 0) {
    if (output) output.textContent = t('noSkillsSelected');
    return;
  }
  if (output) output.textContent = t('loading');
  try {
    const res = await fetch('/api/compat/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ skillNames: [...selectedSkillNames], target }),
    });
    const data = await res.json();
    showBatchResult(data, 'compat', target);
  } catch (err) {
    if (output) output.textContent = t('errorPrefix') + err.message;
  }
}

async function batchMap() {
  const output = document.getElementById('output');
  const targetSelect = document.getElementById('target-agent-select-multi');
  const target = targetSelect ? targetSelect.value : '';
  if (!target) {
    if (output) output.textContent = t('noTargetAvailable');
    return;
  }
  if (selectedSkillNames.size === 0) {
    if (output) output.textContent = t('noSkillsSelected');
    return;
  }
  if (output) output.textContent = t('loading');
  try {
    const res = await fetch('/api/map/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ skillNames: [...selectedSkillNames], target }),
    });
    const data = await res.json();
    showBatchResult(data, 'map', target);
    refreshAfterBatch();
  } catch (err) {
    if (output) output.textContent = t('errorPrefix') + err.message;
  }
}

async function batchUnmap() {
  const output = document.getElementById('output');
  const targetSelect = document.getElementById('target-agent-select-multi');
  const target = targetSelect ? targetSelect.value : '';
  if (!target) {
    if (output) output.textContent = t('noTargetAvailable');
    return;
  }
  if (selectedSkillNames.size === 0) {
    if (output) output.textContent = t('noSkillsSelected');
    return;
  }
  if (output) output.textContent = t('loading');
  try {
    const res = await fetch('/api/unmap/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ skillNames: [...selectedSkillNames], target }),
    });
    const data = await res.json();
    showBatchResult(data, 'unmap', target);
    refreshAfterBatch();
  } catch (err) {
    if (output) output.textContent = t('errorPrefix') + err.message;
  }
}

async function batchAdopt() {
  const output = document.getElementById('output');
  const targetSelect = document.getElementById('target-agent-select-multi');
  const target = targetSelect ? targetSelect.value : '';
  if (!target) {
    if (output) output.textContent = t('noTargetAvailable');
    return;
  }
  if (selectedSkillNames.size === 0) {
    if (output) output.textContent = t('noSkillsSelected');
    return;
  }
  if (output) output.textContent = t('loading');
  try {
    const res = await fetch('/api/adopt/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ skillNames: [...selectedSkillNames], target }),
    });
    const data = await res.json();
    showBatchResult(data, 'adopt', target);
    refreshAfterBatch();
  } catch (err) {
    if (output) output.textContent = t('errorPrefix') + err.message;
  }
}

function refreshAfterBatch() {
  fetch('/api/status', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
    .then((r) => r.json())
    .then((statusData) => { renderStatusCards(statusData); })
    .catch(() => {});
  fetch('/api/discover', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
    .then((r) => r.json())
    .then((discData) => { if (discData.skills) renderDiscoverTable(discData.skills, discData.nonSkillDirectories, true); })
    .catch(() => {});
}

function getPreferredLanguage() {
  const stored = localStorage.getItem('skillgov-language');
  if (stored === 'zh' || stored === 'en') return stored;
  return navigator.language && navigator.language.toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

function t(key) {
  return translations[currentLanguage][key] || translations.en[key] || key;
}

function resolveSkillDisplayDescription(skill) {
  const description = skill.displayDescription || {};
  if (currentLanguage === 'zh') {
    return description.zh || description.en || description.fallback || t('noSkillPurpose');
  }
  return description.en || description.zh || description.fallback || t('noSkillPurpose');
}

function updateLibraryViewButtons() {
  const statusButton = document.getElementById('library-view-status');
  const purposeButton = document.getElementById('library-view-purpose');
  if (statusButton) statusButton.classList.toggle('active', libraryView === 'status');
  if (purposeButton) purposeButton.classList.toggle('active', libraryView === 'purpose');
}

function setLibraryView(view) {
  libraryView = view === 'purpose' ? 'purpose' : 'status';
  selectedSkillNames.clear();
  updatePanelVisibility();
  updateLibraryViewButtons();
  renderDiscoverPage();
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
  updateLibraryViewButtons();
}

let discoverPage = 0;
const PAGE_SIZE = 20;
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
    ? metricSkills.filter((s) => (s.agentStates || []).some((a) => a.state === 'managed-linked' || a.state === 'unmanaged-local')).length
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
      resolveSkillDisplayDescription(s).toLowerCase().includes(q) ||
      ((s.agentStates || []).some((a) => (a.profileLabel || a.profileId).toLowerCase().includes(q)))
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
      const states = s.agentStates || [];
      return states.some((a) => a.profileId === filterAgent);
    });
  }
  return skills;
}

function renderDiscoverTable(skills, nonSkillDirectories, preservePage) {
  latestDiscoverData = skills || [];
  latestNonSkillDirectories = nonSkillDirectories || [];
  if (preservePage) {
    const totalPages = Math.ceil(getFilteredSkills().length / PAGE_SIZE);
    discoverPage = Math.max(0, Math.min(totalPages - 1, discoverPage));
  } else {
    discoverPage = 0;
  }
  populateSourceFilter(latestDiscoverData);
  renderDiscoverPage();
  // Refresh status cards with discover data for accurate metrics
  if (latestStatusData) renderStatusCards(latestStatusData);
}

function formatAppliedAgents(skill) {
  const active = (skill.agentStates || []).filter((s) => s.state === 'managed-linked' || s.state === 'unmanaged-local');
  if (active.length > 0) {
    return active.map((a) => a.profileLabel || a.profileId).join(', ');
  }
  return t('none');
}

function formatAppliedAgentsChip(skill) {
  const active = (skill.agentStates || []).filter((s) => s.state === 'managed-linked' || s.state === 'unmanaged-local');
  if (active.length === 0) return '<span class="agent-chip">' + escapeHtml(t('none')) + '</span>';
  return active.map((a) => '<span class="agent-chip">' + escapeHtml(a.profileLabel || a.profileId) + '</span>').join('');
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

function renderStatusRows(page, start) {
  return page.map((s, index) => {
    const badgeClass = s.validationStatus === 'pass' ? 'status-pass' : s.validationStatus === 'fixable' ? 'status-fixable' : 'status-fail';
    const rowNumber = start + index + 1;
    const escName = escapeHtml(s.name);
    const escStatus = escapeHtml(s.validationStatus || '');
    const escSource = escapeHtml(s.sourceLabel || s.source || '');
    const escPath = escapeHtml(s.path || '');
    const escPathDisplay = escapeHtml(s.path || '-');
    const checked = selectedSkillNames.has(s.name) ? 'checked' : '';
    return '<tr data-skill-number="' + rowNumber + '" style="cursor:pointer;">' +
      '<td class="cb-col"><input type="checkbox" ' + checked + ' data-skill-name="' + escName + '" /></td>' +
      '<td>' + rowNumber + '</td>' +
      '<td>' + escName + '</td>' +
      '<td><span class="status-badge ' + badgeClass + '">' + escStatus + '</span></td>' +
      '<td>' + formatAppliedAgentsChip(s) + '</td>' +
      '<td>' + formatMappingBadge(s.mappingSummary) + '</td>' +
      '<td>' + escSource + '</td>' +
      '<td style="max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="' + escPath + '">' + escPathDisplay + '</td>' +
      '</tr>';
  }).join('');
}

function renderPurposeRows(page, start) {
  return page.map((s, index) => {
    const rowNumber = start + index + 1;
    const escName = escapeHtml(s.name);
    const escPurpose = escapeHtml(resolveSkillDisplayDescription(s));
    return '<tr data-skill-number="' + rowNumber + '" style="cursor:pointer;">' +
      '<td>' + rowNumber + '</td>' +
      '<td>' + escName + '</td>' +
      '<td class="skill-purpose-cell" title="' + escPurpose + '">' + escPurpose + '</td>' +
      '</tr>';
  }).join('');
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
  const rows = libraryView === 'purpose' ? renderPurposeRows(page, start) : renderStatusRows(page, start);
  if (table) {
    if (libraryView === 'purpose') {
      table.innerHTML = '<table class="purpose-table"><thead><tr>' +
        '<th>' + t('tableNumber') + '</th>' +
        '<th>' + t('tableSkill') + '</th>' +
        '<th>' + t('tableSkillPurpose') + '</th>' +
        '</tr></thead><tbody>' + rows + '</tbody></table>';
    } else {
      const allPageSelected = page.length > 0 && page.every((s) => selectedSkillNames.has(s.name));
      table.innerHTML = '<table><thead><tr>' +
        '<th class="cb-col"><input type="checkbox" ' + (allPageSelected ? 'checked' : '') + ' id="select-all-checkbox" title="' + escapeHtml(t('selectAll')) + '" /></th>' +
        '<th>' + t('tableNumber') + '</th>' +
        '<th>' + t('tableSkill') + '</th>' +
        '<th>' + t('tableStatus') + '</th>' +
        '<th>' + t('tableAppliedAgentsChip') + '</th>' +
        '<th>' + t('tableMappingStatus') + '</th>' +
        '<th>' + t('tableSourceLabel') + '</th>' +
        '<th>' + t('tablePathLabel') + '</th>' +
        '</tr></thead><tbody>' + rows + '</tbody></table>';
    }
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

  if (endpoint === 'install' || endpoint === 'uninstall' || endpoint === 'map' || endpoint === 'unmap' || endpoint === 'adopt') {
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
    if (endpoint === 'map' || endpoint === 'unmap' || endpoint === 'adopt') {
      showSingleResult(data, endpoint);
    } else {
      if (output) output.textContent = JSON.stringify(data, null, 2);
    }
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
    if (endpoint === 'install' || endpoint === 'uninstall' || endpoint === 'map' || endpoint === 'unmap' || endpoint === 'adopt') {
      fetch('/api/status', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
        .then((r) => r.json())
        .then((statusData) => { renderStatusCards(statusData); })
        .catch(() => {});
      fetch('/api/discover', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
        .then((r) => r.json())
        .then((discData) => { if (discData.skills) renderDiscoverTable(discData.skills, discData.nonSkillDirectories, true); })
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
      selectedSkillNames.clear();
      updatePanelVisibility();
      renderDiscoverPage();
    });
  }
  const statusFilter = document.getElementById('skill-status-filter');
  if (statusFilter) {
    statusFilter.addEventListener('change', (event) => {
      filterStatus = event.target.value || '';
      discoverPage = 0;
      selectedSkillNames.clear();
      updatePanelVisibility();
      renderDiscoverPage();
    });
  }
  const sourceFilter = document.getElementById('skill-source-filter');
  if (sourceFilter) {
    sourceFilter.addEventListener('change', (event) => {
      filterSource = event.target.value || '';
      discoverPage = 0;
      selectedSkillNames.clear();
      updatePanelVisibility();
      renderDiscoverPage();
    });
  }
  const mappingFilter = document.getElementById('skill-mapping-filter');
  if (mappingFilter) {
    mappingFilter.addEventListener('change', (event) => {
      filterMapping = event.target.value || '';
      discoverPage = 0;
      selectedSkillNames.clear();
      updatePanelVisibility();
      renderDiscoverPage();
    });
  }
  const agentFilter = document.getElementById('skill-agent-filter');
  if (agentFilter) {
    agentFilter.addEventListener('change', (event) => {
      filterAgent = event.target.value || '';
      discoverPage = 0;
      selectedSkillNames.clear();
      updatePanelVisibility();
      renderDiscoverPage();
    });
  }

  // Event delegation for discover-table checkboxes and row clicks
  const tableContainer = document.getElementById('discover-table');
  if (tableContainer) {
    tableContainer.addEventListener('change', (event) => {
      const target = event.target;
      if (target && target.type === 'checkbox' && target.id === 'select-all-checkbox') {
        togglePageSelection(target.checked);
      } else if (target && target.type === 'checkbox' && target.dataset.skillName) {
        toggleSkillSelection(target.dataset.skillName, target.checked);
      }
    });
    tableContainer.addEventListener('click', (event) => {
      const target = event.target;
      if (target && target.closest('.cb-col')) return;
      const row = target ? target.closest('tr[data-skill-number]') : null;
      if (row) selectSkillNumber(row.dataset.skillNumber);
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
        populateTargetOptions();
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
