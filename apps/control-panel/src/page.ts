// HTML page renderer for the local SkillGov control panel UI.
import { controlPanelClientScript } from './client-script.js';
import { controlPanelStyles } from './styles.js';

export interface ControlPanelPageOptions {
  version: string;
}

export function renderControlPanelPage({ version }: ControlPanelPageOptions): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>SkillGov Control Panel</title>
<style>
${controlPanelStyles}
</style>
</head>
<body>
<div class="page-header">
  <div class="title-block">
    <h1 data-i18n="title">SkillGov Control Panel</h1>
    <div class="subtitle">v${version} — <span id="project-path"></span></div>
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
<div id="status-summary"></div>

<h2 data-i18n="discoverHeading">Skill Library</h2>
<div class="grid">
  <button onclick="callAPI('discover')" data-i18n="scanLocal">Scan Local Skills</button>
</div>
<div id="discover-summary"></div>
<div id="discover-table"></div>
<div id="discover-pagination"></div>

<h2 data-i18n="compatibilityHeading">Compatibility</h2>
<div class="field-row">
  <input id="compat-number" placeholder="Skill number..." data-i18n-placeholder="skillNumberPlaceholder" />
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
${controlPanelClientScript}
</script>
</body>
</html>`;
}
