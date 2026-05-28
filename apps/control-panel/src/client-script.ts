// Browser interaction script string used by the control panel HTML page — two-pane layout with visual compatibility results.
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
}

interface BrowserTarget {
  id: string;
  label: string;
}

declare global {
  interface Window {
    selectedSkill: BrowserSkill | null;
    availableTargets?: BrowserTarget[];
    t: (key: string) => string;
    resolveSkillByNumber: (value: string) => BrowserSkill | null;
    populateTargetOptions: (skill: BrowserSkill) => void;
    renderCompatibilityResult: (data: Record<string, unknown>) => void;
  }
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
  if (titleEl) titleEl.textContent = skill.name;
  if (metaEl) {
    const parts = [skill.sourceLabel || skill.source, skill.validationStatus];
    if (skill.agentTargets && skill.agentTargets.length > 0) {
      parts.push(skill.agentTargets.join(', '));
    }
    metaEl.textContent = parts.join(' · ');
  }
  window.populateTargetOptions(skill);
}

function populateTargetOptionsBody(skill: BrowserSkill): void {
  void skill;
  const select = document.getElementById('target-agent-select');
  if (!select) return;
  const targets = Array.isArray(window.availableTargets)
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

function renderCompatibilityResultBody(data: Record<string, unknown>): void {
  const card = document.getElementById('compat-result-card');
  const output = document.getElementById('output');
  if (card) {
    const status = (data.status as string) || 'unknown';
    const badgeClass = STATUS_CLASSES[status] || 'status-fail';
    const statusKey = `${status}Status`;
    const statusLabel = window.t(statusKey) || status;
    let html = '<div class="compat-card">';
    html += `<span class="status-badge ${badgeClass}">${statusLabel}</span>`;
    if (data.reason) {
      html += `<p class="compat-reason">${data.reason}</p>`;
    }
    if (data.suggestedAction) {
      html += `<p class="compat-action"><strong>${window.t('checkButton')}:</strong> ${data.suggestedAction}</p>`;
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

const clientScriptBody = `
let currentLanguage = 'en';
let latestStatusData = null;
let selectedSkill = null;

const DEFAULT_TARGETS = ${JSON.stringify(DEFAULT_TARGETS)};
const STATUS_CLASSES = ${JSON.stringify(STATUS_CLASSES)};

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

function renderStatusSummary(data) {
  latestStatusData = data;
  const el = document.getElementById('status-summary');
  if (!el) return;
  const skills = data.skills || [];
  const totalManaged = skills.length;
  const installedClaude = skills.filter((s) => s.installedTargets && s.installedTargets.includes('claude')).length;
  const installedCodex = skills.filter((s) => s.installedTargets && s.installedTargets.includes('codex')).length;
  const notInstalled = skills.filter((s) => !s.installedTargets || s.installedTargets.length === 0).length;
  const withOverlay = skills.filter((s) => s.hasOverlay).length;
  const excludedDirectories = (data.nonSkillDirectories || []).length;
  el.innerHTML = \`<table><tbody>
    <tr><td><strong>\${t('totalManaged')}</strong></td><td>\${totalManaged}</td></tr>
    <tr><td><strong>\${t('installedClaude')}</strong></td><td>\${installedClaude}</td></tr>
    <tr><td><strong>\${t('installedCodex')}</strong></td><td>\${installedCodex}</td></tr>
    <tr><td><strong>\${t('notInstalled')}</strong></td><td>\${notInstalled}</td></tr>
    <tr><td><strong>\${t('withOverlay')}</strong></td><td>\${withOverlay}</td></tr>
    <tr><td><strong>\${t('excludedDirectories')}</strong></td><td>\${excludedDirectories}</td></tr>
  </tbody></table>\`;
}

function renderDiscoverTable(skills, nonSkillDirectories) {
  latestDiscoverData = skills || [];
  latestNonSkillDirectories = nonSkillDirectories || [];
  discoverPage = 0;
  renderDiscoverPage();
}

function formatAgentTargets(agentTargets) {
  const labels = { codex: 'Codex', claude: 'Claude' };
  if (!agentTargets || agentTargets.length === 0) return t('none');
  return agentTargets.map((target) => labels[target] || target).join(', ');
}

function resolveSkillByNumber(value) {
  const number = Number.parseInt(value, 10);
  if (!Number.isInteger(number) || number < 1 || number > latestDiscoverData.length) return null;
  return latestDiscoverData[number - 1];
}

function selectSkillNumber(value) {
  ${selectSkillNumberBody
    .toString()
    .replace(/^function\s*\w*\s*\(value\)\s*\{/, '')
    .replace(/\}$/, '')}
}

function populateTargetOptions(skill) {
  ${populateTargetOptionsBody
    .toString()
    .replace(/^function\s*\w*\s*\(skill\)\s*\{/, '')
    .replace(/\}$/, '')}
}

function renderCompatibilityResult(data) {
  ${renderCompatibilityResultBody
    .toString()
    .replace(/^function\s*\w*\s*\(data\)\s*\{/, '')
    .replace(/\}$/, '')}
}

async function checkSelectedCompatibility() {
  ${checkSelectedCompatibilityBody
    .toString()
    .replace(/^async\s+function\s*\w*\s*\(\)\s*\{/, '')
    .replace(/\}$/, '')}
}

function renderDiscoverPage() {
  const skills = latestDiscoverData;
  const summary = document.getElementById('discover-summary');
  const table = document.getElementById('discover-table');
  const pagination = document.getElementById('discover-pagination');

  if (!skills || skills.length === 0) {
    if (summary) summary.innerHTML = '';
    if (table) table.innerHTML = \`<p>\${t('noSkills')}</p>\`;
    if (pagination) pagination.innerHTML = '';
    return;
  }

  const totalPages = Math.ceil(skills.length / PAGE_SIZE);
  const passCount = skills.filter((s) => s.validationStatus === 'pass').length;
  const fixableCount = skills.filter((s) => s.validationStatus === 'fixable').length;
  const failCount = skills.filter((s) => s.validationStatus === 'fail').length;

  if (summary) {
    summary.innerHTML = \`<table><tbody>
      <tr><td><strong>\${t('totalDiscovered')}</strong></td><td>\${skills.length}</td></tr>
      <tr><td><strong>\${t('validationPass')}</strong></td><td>\${passCount}</td></tr>
      <tr><td><strong>\${t('validationFixable')}</strong></td><td>\${fixableCount}</td></tr>
      <tr><td><strong>\${t('validationFail')}</strong></td><td>\${failCount}</td></tr>
      <tr><td><strong>\${t('excludedDirectories')}</strong></td><td>\${latestNonSkillDirectories.length}</td></tr>
    </tbody></table>\`;
  }

  const start = discoverPage * PAGE_SIZE;
  const page = skills.slice(start, start + PAGE_SIZE);
  const rows = page.map((s, index) => {
    const badgeClass = s.validationStatus === 'pass' ? 'status-pass' : s.validationStatus === 'fixable' ? 'status-fixable' : 'status-fail';
    const rowNumber = start + index + 1;
    return \`<tr data-skill-number="\${rowNumber}" onclick="selectSkillNumber('\${rowNumber}')" style="cursor:pointer;"><td>\${rowNumber}</td><td>\${s.name}</td><td>\${s.sourceLabel || s.source}</td><td><span class="status-badge \${badgeClass}">\${s.validationStatus}</span></td><td>\${formatAgentTargets(s.agentTargets)}</td></tr>\`;
  }).join('');
  if (table) {
    table.innerHTML = \`<table><thead><tr><th>\${t('tableNumber')}</th><th>\${t('tableSkill')}</th><th>\${t('tableSource')}</th><th>\${t('tableValidation')}</th><th>\${t('tableAgent')}</th></tr></thead><tbody>\${rows}</tbody></table>\`;
  }

  const pageInfo = t('pageInfo').replace('{current}', discoverPage + 1).replace('{total}', totalPages);
  if (pagination) {
    pagination.innerHTML = \`<div style="display:flex;gap:8px;align-items:center;margin-top:8px;">
      <button onclick="changeDiscoverPage(-1)" \${discoverPage === 0 ? 'disabled' : ''}>\${t('prevPage')}</button>
      <span>\${pageInfo}</span>
      <button onclick="changeDiscoverPage(1)" \${discoverPage >= totalPages - 1 ? 'disabled' : ''}>\${t('nextPage')}</button>
      <span style="margin-left:12px;color:#666;">\${t('totalSkills').replace('{count}', skills.length)}</span>
    </div>\`;
  }
}

function changeDiscoverPage(delta) {
  const totalPages = Math.ceil(latestDiscoverData.length / PAGE_SIZE);
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
      renderStatusSummary(data);
    }
    if (endpoint === 'discover' && data.skills) {
      renderDiscoverTable(data.skills, data.nonSkillDirectories);
    }
    if (endpoint === 'discover/import' && data.results) {
      callAPI('discover');
    }
  } catch (err) {
    if (output) output.textContent = t('errorPrefix') + err.message;
  }
}

window.addEventListener('DOMContentLoaded', () => {
  applyLanguage(getPreferredLanguage());
  document.getElementById('language-select')?.addEventListener('change', (event) => {
    applyLanguage(event.target.value);
    if (latestStatusData) renderStatusSummary(latestStatusData);
    if (latestDiscoverData.length > 0) renderDiscoverPage();
  });
  const searchParams = new URLSearchParams(window.location.search);
  const pp = document.getElementById('project-path');
  fetch('/api/status')
    .then(r => r.json())
    .then(data => {
      if (pp) pp.textContent = data.projectRoot || t('noProject');
      renderStatusSummary(data);
      if (searchParams.get('discover') === '1') callAPI('discover');
    })
    .catch(() => { if (pp) pp.textContent = t('statusLoadFailed'); });
});
`;

export const controlPanelClientScript = `const translations = ${JSON.stringify(translations, null, 2)};\n\n${clientScriptBody}`;

export const clientScriptFunctions = {
  selectSkillNumber: selectSkillNumberBody,
  populateTargetOptions: populateTargetOptionsBody,
  renderCompatibilityResult: renderCompatibilityResultBody,
  checkSelectedCompatibility: checkSelectedCompatibilityBody,
  DEFAULT_TARGETS,
  STATUS_CLASSES,
};
