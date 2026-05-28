// HTML page renderer for the local SkillGov control panel UI — two-pane layout with skill library and action panel.
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

<div class="two-pane">
  <div id="skill-library-pane" class="pane-left">
    <h2 data-i18n="discoverHeading">Skill Library</h2>
    <div class="grid">
      <button onclick="callAPI('discover')" data-i18n="scanLocal">Scan Local Skills</button>
    </div>
    <div id="discover-summary"></div>
    <div id="discover-table"></div>
    <div id="discover-pagination"></div>
  </div>

  <div id="skill-action-pane" class="pane-right">
    <h2 data-i18n="selectedSkillHeading">Selected Skill</h2>
    <div id="selected-skill-title" class="selected-skill-name">—</div>
    <div id="selected-skill-meta" class="selected-skill-info"></div>

    <h3 data-i18n="targetAgentHeading">Target Agent</h3>
    <select id="target-agent-select" aria-label="Target Agent"></select>

    <h3 data-i18n="compatibilityHeading">Compatibility</h3>
    <div class="grid">
      <button onclick="callAPI('compat')" data-i18n="checkButton">Check</button>
    </div>
    <div id="compat-result-card"></div>

    <h3 data-i18n="mappingHeading">Mapping</h3>
    <div class="grid">
      <button onclick="callAPI('map')" class="primary" data-i18n="mapButton">Map to Agent</button>
      <button onclick="callAPI('unmap')" class="danger" data-i18n="unmapButton">Unmap</button>
    </div>

    <details id="system-diagnostics-panel">
      <summary data-i18n="diagnosticsHeading">Diagnostics</summary>
      <div class="grid">
        <button onclick="callAPI('doctor')" data-i18n="doctorButton">Run Doctor</button>
        <button onclick="callAPI('rollback')" class="danger" data-i18n="rollbackButton">Rollback Last</button>
      </div>
    </details>

    <h3 data-i18n="outputHeading">Output</h3>
    <details id="raw-output-details" open>
      <summary data-i18n="outputSummary">Raw Output</summary>
      <pre id="output" data-i18n="outputEmpty">Click a button to see results.</pre>
    </details>
  </div>
</div>

<script>
${controlPanelClientScript}
</script>
</body>
</html>`;
}
