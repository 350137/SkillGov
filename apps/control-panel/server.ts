// Local web control panel server — provides a button-based UI over @skillgov/core operations via HTTP API endpoints.
import { existsSync, readFileSync } from 'node:fs';
import http from 'node:http';
import { URL } from 'node:url';
import {
  VERSION,
  checkCompatibility,
  discoverSkills,
  generateOverlayTask,
  generateRepairTask,
  getProjectStatus,
  importSkill,
  initProject,
  installSkill,
  loadConfig,
  rollbackLastInstall,
  runDoctor,
  uninstallSkill,
  validateSkill,
} from '@skillgov/core';

const PORT = Number.parseInt(process.env.PORT || '4173', 10);

type ApiHandler = (
  body: Record<string, unknown>,
) => Promise<Record<string, unknown>> | Record<string, unknown>;

const apiRoutes: Record<string, ApiHandler> = {
  status: () => {
    const config = loadConfig();
    const status = getProjectStatus(config.projectRoot);
    return status as unknown as Record<string, unknown>;
  },

  validate: (body) => {
    const path = body.path as string;
    if (!path) return { error: 'Missing "path" field' };
    const result = validateSkill(path);
    return result as unknown as Record<string, unknown>;
  },

  import: (body) => {
    const sourcePath = body.sourcePath as string;
    if (!sourcePath) return { error: 'Missing "sourcePath" field' };
    const config = loadConfig();
    const incoming = `${config.projectRoot}/incoming`;
    const skills = `${config.projectRoot}/skills`;
    try {
      return importSkill(sourcePath, {
        incoming,
        skills,
        registryPath: `${config.projectRoot}/registry/skills.json`,
      }) as unknown as Record<string, unknown>;
    } catch (err) {
      return { status: 'fail', message: (err as Error).message };
    }
  },

  compat: (body) => {
    const skillPath = body.skillPath as string;
    const target = body.target as string;
    if (!skillPath || !target) return { error: 'Missing "skillPath" or "target" field' };
    return checkCompatibility(skillPath, target) as unknown as Record<string, unknown>;
  },

  install: (body) => {
    const skillName = body.skillName as string;
    const target = body.target as string;
    if (!skillName || !target) return { error: 'Missing "skillName" or "target" field' };
    const config = loadConfig();
    return installSkill(skillName, target, config.defaultLinkMode, {
      projectRoot: config.projectRoot,
      registryPath: `${config.projectRoot}/registry/installs.json`,
      operationsPath: `${config.projectRoot}/registry/operations.jsonl`,
    }) as unknown as Record<string, unknown>;
  },

  uninstall: (body) => {
    const skillName = body.skillName as string;
    const target = body.target as string;
    if (!skillName || !target) return { error: 'Missing "skillName" or "target" field' };
    const config = loadConfig();
    return uninstallSkill(skillName, target, {
      projectRoot: config.projectRoot,
      registryPath: `${config.projectRoot}/registry/installs.json`,
      operationsPath: `${config.projectRoot}/registry/operations.jsonl`,
    }) as unknown as Record<string, unknown>;
  },

  'task/repair': (body) => {
    const skillPath = body.skillPath as string;
    if (!skillPath) return { error: 'Missing "skillPath" field' };
    const validation = validateSkill(skillPath);
    if (validation.status !== 'fixable') {
      return { error: `Skill status is "${validation.status}", expected "fixable"` };
    }
    return generateRepairTask({ skillPath, validation }) as unknown as Record<string, unknown>;
  },

  'task/overlay': (body) => {
    const skillPath = body.skillPath as string;
    const target = body.target as string;
    if (!skillPath || !target) return { error: 'Missing "skillPath" or "target" field' };
    const compatResult = checkCompatibility(skillPath, target);
    if (compatResult.status !== 'needs-overlay') {
      return { error: `Status is "${compatResult.status}", expected "needs-overlay"` };
    }
    return generateOverlayTask({
      skillPath,
      targetName: target,
      compatResult,
    }) as unknown as Record<string, unknown>;
  },

  doctor: () => {
    const config = loadConfig();
    return runDoctor(config.projectRoot) as unknown as Record<string, unknown>;
  },

  rollback: (body) => {
    const target = body.target as string;
    if (!target) return { error: 'Missing "target" field' };
    const config = loadConfig();
    return rollbackLastInstall(target, {
      projectRoot: config.projectRoot,
      registryPath: `${config.projectRoot}/registry/installs.json`,
      operationsPath: `${config.projectRoot}/registry/operations.jsonl`,
    }) as unknown as Record<string, unknown>;
  },

  discover: () => {
    const config = loadConfig();
    const registryPath = `${config.projectRoot}/registry/skills.json`;
    return { skills: discoverSkills({ registryPath }) } as unknown as Record<string, unknown>;
  },

  'discover/import': () => {
    const config = loadConfig();
    const registryPath = `${config.projectRoot}/registry/skills.json`;
    const incoming = `${config.projectRoot}/incoming`;
    const skills = `${config.projectRoot}/skills`;
    const discovered = discoverSkills({ registryPath });
    const passSkills = discovered.filter(
      (s) => s.validationStatus === 'pass' && !s.alreadyImported,
    );

    const results: Array<{ name: string; status: string; message?: string }> = [];
    for (const skill of passSkills) {
      try {
        const result = importSkill(skill.path, {
          incoming,
          skills,
          registryPath,
          origin: skill.source,
        });
        results.push({ name: result.skillName, status: result.status });
      } catch (err) {
        results.push({ name: skill.name, status: 'fail', message: (err as Error).message });
      }
    }

    return {
      total: discovered.length,
      imported: results.filter((r) => r.status === 'pass').length,
      results,
    } as unknown as Record<string, unknown>;
  },
};

const HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>SkillGov Control Panel</title>
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; color: #333; padding: 20px; max-width: 960px; margin: 0 auto; }
.page-header { display: flex; justify-content: space-between; gap: 24px; align-items: flex-start; margin-bottom: 36px; }
.title-block { min-width: 0; }
.header-actions { display: flex; align-items: center; justify-content: flex-end; padding-top: 4px; }
h1 { font-size: 1.5rem; margin-bottom: 8px; }
h2 { font-size: 1.1rem; margin: 20px 0 10px; border-bottom: 1px solid #ddd; padding-bottom: 4px; }
.subtitle { color: #666; font-size: 0.85rem; }
.language-control { display: inline-flex; gap: 8px; align-items: center; font-size: 0.85rem; color: #555; }
.language-control select { padding: 6px 8px; border: 1px solid #ccc; border-radius: 4px; background: #fff; font-size: 0.85rem; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 8px; margin-bottom: 20px; }
button { padding: 10px 16px; border: 1px solid #ccc; border-radius: 6px; background: #fff; cursor: pointer; font-size: 0.85rem; transition: background 0.15s; }
button:hover { background: #e8e8e8; }
button.primary { background: #0066cc; color: #fff; border-color: #0055aa; }
button.primary:hover { background: #0055aa; }
button.danger { background: #cc3300; color: #fff; border-color: #aa2a00; }
button.danger:hover { background: #aa2a00; }
button:disabled { opacity: 0.5; cursor: default; }
.field-row { display: flex; gap: 8px; margin-bottom: 8px; align-items: center; }
.field-row input, .field-row select { padding: 8px; border: 1px solid #ccc; border-radius: 4px; flex: 1; font-size: 0.85rem; }
pre { background: #1e1e1e; color: #d4d4d4; padding: 12px; border-radius: 6px; overflow-x: auto; font-size: 0.8rem; max-height: 400px; overflow-y: auto; }
#output { margin-top: 20px; }
table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
th, td { padding: 8px 10px; text-align: left; border-bottom: 1px solid #eee; }
th { font-weight: 600; background: #fafafa; }
.status-badge { display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 0.75rem; font-weight: 600; }
.status-pass { background: #d4edda; color: #155724; }
.status-fail { background: #f8d7da; color: #721c24; }
.status-fixable { background: #fff3cd; color: #856404; }
@media (max-width: 640px) { .page-header { flex-direction: column; margin-bottom: 24px; } .header-actions { width: 100%; justify-content: flex-start; padding-top: 0; } }
</style>
</head>
<body>
<div class="page-header">
  <div class="title-block">
    <h1 data-i18n="title">SkillGov Control Panel</h1>
    <div class="subtitle">v${VERSION} — <span id="project-path"></span></div>
  </div>
  <div class="header-actions">

<label class="language-control" for="language-select">
  <span data-i18n="languageLabel">Language</span>
  <select id="language-select" aria-label="Language">
    <option value="zh">中文</option>
    <option value="en">English</option>
  </select>
</label>
  </div>
</div>

<h2 data-i18n="statusHeading">Status</h2>
<div class="grid">
  <button onclick="callAPI('status')" class="primary" data-i18n="refreshStatus">Refresh Status</button>
</div>
<div id="status-table"></div>

<h2 data-i18n="discoverHeading">Local Skills</h2>
<div class="grid">
  <button onclick="callAPI('discover')" data-i18n="scanLocal">Scan Local Skills</button>
  <button onclick="callAPI('discover/import')" class="primary" data-i18n="importPassed">Import Passed Skills</button>
</div>
<div id="discover-table"></div>

<h2 data-i18n="importValidateHeading">Import & Validate</h2>
<div class="field-row">
  <input id="import-path" placeholder="Path to skill directory..." data-i18n-placeholder="importPathPlaceholder" />
  <button onclick="callAPI('import')" data-i18n="importButton">Import</button>
</div>
<div class="field-row">
  <input id="validate-path" placeholder="Path to skill..." data-i18n-placeholder="skillPathPlaceholder" />
  <button onclick="callAPI('validate')" data-i18n="validateButton">Validate</button>
</div>

<h2 data-i18n="compatibilityHeading">Compatibility</h2>
<div class="field-row">
  <input id="compat-path" placeholder="Skill path..." data-i18n-placeholder="skillPathPlaceholder" />
  <select id="compat-target"><option value="claude">Claude</option><option value="codex">Codex</option></select>
  <button onclick="callAPI('compat')" data-i18n="checkButton">Check</button>
</div>

<h2 data-i18n="installHeading">Install / Uninstall</h2>
<div class="field-row">
  <input id="install-skill" placeholder="Skill name..." data-i18n-placeholder="skillNamePlaceholder" />
  <select id="install-target"><option value="claude">Claude</option><option value="codex">Codex</option></select>
  <button onclick="callAPI('install')" class="primary" data-i18n="installButton">Install</button>
  <button onclick="callAPI('uninstall')" class="danger" data-i18n="uninstallButton">Uninstall</button>
</div>

<h2 data-i18n="tasksHeading">Tasks</h2>
<div class="field-row">
  <input id="task-path" placeholder="Skill path..." data-i18n-placeholder="skillPathPlaceholder" />
  <select id="task-target"><option value="claude">Claude</option><option value="codex">Codex</option></select>
  <button onclick="callAPI('task/repair')" data-i18n="repairTaskButton">Repair Task</button>
  <button onclick="callAPI('task/overlay')" data-i18n="overlayTaskButton">Overlay Task</button>
</div>

<h2 data-i18n="diagnosticsHeading">Diagnostics</h2>
<div class="grid">
  <button onclick="callAPI('doctor')" data-i18n="doctorButton">Run Doctor</button>
  <button onclick="callAPI('rollback')" class="danger" data-i18n="rollbackButton">Rollback Last</button>
</div>

<h2 data-i18n="outputHeading">Output</h2>
<pre id="output" data-i18n="outputEmpty">Click a button to see results.</pre>

<script>
const translations = {
  en: {
    title: 'SkillGov Control Panel',
    languageLabel: 'Language',
    statusHeading: 'Status',
    refreshStatus: 'Refresh Status',
    discoverHeading: 'Local Skills',
    scanLocal: 'Scan Local Skills',
    importPassed: 'Import Passed Skills',
    importValidateHeading: 'Import & Validate',
    importPathPlaceholder: 'Path to skill directory...',
    skillPathPlaceholder: 'Path to skill...',
    skillNamePlaceholder: 'Skill name...',
    importButton: 'Import',
    validateButton: 'Validate',
    compatibilityHeading: 'Compatibility',
    checkButton: 'Check',
    installHeading: 'Install / Uninstall',
    installButton: 'Install',
    uninstallButton: 'Uninstall',
    tasksHeading: 'Tasks',
    repairTaskButton: 'Repair Task',
    overlayTaskButton: 'Overlay Task',
    diagnosticsHeading: 'Diagnostics',
    doctorButton: 'Run Doctor',
    rollbackButton: 'Rollback Last',
    outputHeading: 'Output',
    outputEmpty: 'Click a button to see results.',
    loading: 'Loading...',
    errorPrefix: 'Error: ',
    tableSkill: 'Skill',
    tableSource: 'Source',
    tableStatus: 'Status',
    tablePath: 'Path',
    tableImported: 'Imported',
    tableOverlay: 'Overlay',
    tableTargets: 'Targets',
    yes: 'Yes',
    no: 'No',
    none: '-',
    noSkills: 'No skills found.',
    noProject: '(no project)',
    statusLoadFailed: 'Could not load status',
  },
  zh: {
    title: 'SkillGov 控制面板',
    languageLabel: '语言',
    statusHeading: '状态',
    refreshStatus: '刷新状态',
    discoverHeading: '本机技能',
    scanLocal: '扫描本机技能',
    importPassed: '导入已通过技能',
    importValidateHeading: '导入与验证',
    importPathPlaceholder: '技能目录路径...',
    skillPathPlaceholder: '技能路径...',
    skillNamePlaceholder: '技能名称...',
    importButton: '导入',
    validateButton: '验证',
    compatibilityHeading: '兼容性',
    checkButton: '检查',
    installHeading: '安装 / 卸载',
    installButton: '安装',
    uninstallButton: '卸载',
    tasksHeading: '任务',
    repairTaskButton: '修复任务',
    overlayTaskButton: '覆盖层任务',
    diagnosticsHeading: '诊断',
    doctorButton: '运行 Doctor',
    rollbackButton: '回滚最近安装',
    outputHeading: '输出',
    outputEmpty: '点击按钮查看结果。',
    loading: '加载中...',
    errorPrefix: '错误：',
    tableSkill: '技能',
    tableSource: '来源',
    tableStatus: '状态',
    tablePath: '路径',
    tableImported: '已导入',
    tableOverlay: '覆盖层',
    tableTargets: '目标',
    yes: '是',
    no: '否',
    none: '-',
    noSkills: '未找到技能。',
    noProject: '（无项目）',
    statusLoadFailed: '无法加载状态',
  },
};

let currentLanguage = 'en';
let latestStatusData = null;

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

function renderStatusTable(data) {
  latestStatusData = data;
  const table = document.getElementById('status-table');
  const rows = (data.skills || [])
    .map((s) => \`<tr><td>\${s.name}</td><td>\${s.hasOverlay ? t('yes') : t('no')}</td><td>\${s.overlayTargets.join(', ') || t('none')}</td></tr>\`)
    .join('');
  table.innerHTML = \`<table><thead><tr><th>\${t('tableSkill')}</th><th>\${t('tableOverlay')}</th><th>\${t('tableTargets')}</th></tr></thead><tbody>\${rows || \`<tr><td colspan="3">\${t('noSkills')}</td></tr>\`}</tbody></table>\`;
}

function renderDiscoverTable(skills) {
  const table = document.getElementById('discover-table');
  if (!skills || skills.length === 0) {
    table.innerHTML = \`<p>\${t('noSkills')}</p>\`;
    return;
  }
  const rows = skills.map((s) => {
    const badgeClass = s.validationStatus === 'pass' ? 'status-pass' : s.validationStatus === 'fixable' ? 'status-fixable' : 'status-fail';
    return \`<tr><td>\${s.name}</td><td>\${s.source}</td><td><span class="status-badge \${badgeClass}">\${s.validationStatus}</span></td><td>\${s.path}</td><td>\${s.alreadyImported ? t('yes') : t('no')}</td></tr>\`;
  }).join('');
  table.innerHTML = \`<table><thead><tr><th>\${t('tableSkill')}</th><th>\${t('tableSource')}</th><th>\${t('tableStatus')}</th><th>\${t('tablePath')}</th><th>\${t('tableImported')}</th></tr></thead><tbody>\${rows}</tbody></table>\`;
}
async function callAPI(endpoint) {
  const output = document.getElementById('output');
  output.textContent = t('loading');

  const body = {};
  const fields = {
    import: { sourcePath: 'import-path' },
    validate: { path: 'validate-path' },
    compat: { skillPath: 'compat-path', target: 'compat-target' },
    install: { skillName: 'install-skill', target: 'install-target' },
    uninstall: { skillName: 'install-skill', target: 'install-target' },
    'task/repair': { skillPath: 'task-path' },
    'task/overlay': { skillPath: 'task-path', target: 'task-target' },
    rollback: { target: 'install-target' },
  };

  if (fields[endpoint]) {
    for (const [key, elId] of Object.entries(fields[endpoint])) {
      const el = document.getElementById(elId);
      if (el) body[key] = el.value || el.value;
    }
  }

  try {
    const res = await fetch('/api/' + endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    output.textContent = JSON.stringify(data, null, 2);
    if (endpoint === 'status') {
      latestStatusData = data;
      renderStatusTable(data);
    }
    if (endpoint === 'discover' && data.skills) {
      renderDiscoverTable(data.skills);
    }
    if (endpoint === 'discover/import' && data.results) {
      callAPI('discover');
    }
  } catch (err) {
    output.textContent = t('errorPrefix') + err.message;
  }
}

// Load initial status
window.addEventListener('DOMContentLoaded', () => {
  applyLanguage(getPreferredLanguage());
  document.getElementById('language-select').addEventListener('change', (event) => {
    applyLanguage(event.target.value);
    if (latestStatusData) renderStatusTable(latestStatusData);
  });
  const searchParams = new URLSearchParams(window.location.search);
  const pp = document.getElementById('project-path');
  fetch('/api/status')
    .then(r => r.json())
    .then(data => {
      pp.textContent = data.projectRoot || t('noProject');
      renderStatusTable(data);
      if (searchParams.get('discover') === '1') callAPI('discover');
    })
    .catch(() => { pp.textContent = t('statusLoadFailed'); });
});
</script>
</body>
</html>`;

function parseBody(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (chunk: string) => {
      data += chunk;
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(data));
      } catch {
        resolve({});
      }
    });
  });
}

export function startServer(port: number = PORT): http.Server {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url || '/', `http://${req.headers.host}`);
    const path = url.pathname;

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    // Serve HTML
    if (req.method === 'GET' && path === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(HTML);
      return;
    }

    if (
      req.method === 'GET' &&
      path === '/api/discover' &&
      (req.headers.accept || '').includes('text/html')
    ) {
      res.writeHead(303, { Location: '/?discover=1' });
      res.end();
      return;
    }

    // API routes — accept both GET and POST
    if ((req.method === 'GET' || req.method === 'POST') && path.startsWith('/api/')) {
      const route = path.slice(5); // Remove '/api/'
      const handler = apiRoutes[route];
      if (!handler) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: `Unknown API: ${route}` }));
        return;
      }
      const body = req.method === 'GET' ? {} : await parseBody(req);
      try {
        const result = handler(body);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: (err as Error).message }));
      }
      return;
    }

    res.writeHead(404);
    res.end('Not found');
  });

  server.listen(port, () => {
    console.log(`SkillGov Control Panel running at http://localhost:${port}`);
  });

  return server;
}

// Auto-start when run directly
if (process.argv[1]?.endsWith('server.ts') || process.argv[1]?.endsWith('server.js')) {
  startServer();
}
