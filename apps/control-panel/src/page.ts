// HTML page renderer for the local SkillGov control panel UI — console layout with status cards, skill library, and operations panel.
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

<div id="status-cards"></div>

<div class="main-columns">
  <div id="skill-library-card" class="card">
    <div class="card-header">
      <h2 data-i18n="discoverHeading">Skill Library</h2>
    </div>
    <div class="toolbar">
      <input id="skill-search-input" type="text" data-i18n-placeholder="skillSearchPlaceholder" placeholder="Search skills..." />
      <select id="skill-status-filter" aria-label="Status Filter">
        <option value="" data-i18n="allStatuses">All Statuses</option>
        <option value="pass" data-i18n="filterStatusPass">Pass</option>
        <option value="fixable" data-i18n="filterStatusFixable">Fixable</option>
        <option value="fail" data-i18n="filterStatusFail">Fail</option>
      </select>
      <select id="skill-source-filter" aria-label="Source Filter">
        <option value="" data-i18n="allSources">All Sources</option>
      </select>
      <select id="skill-mapping-filter" aria-label="Mapping Filter">
        <option value="" data-i18n="allMappings">All Mappings</option>
        <option value="linked" data-i18n="filterMappingLinked">Linked</option>
        <option value="missing" data-i18n="filterMappingMissing">Missing</option>
        <option value="conflict" data-i18n="filterMappingConflict">Conflict</option>
        <option value="unmapped" data-i18n="filterMappingUnmapped">Unmapped</option>
      </select>
      <select id="skill-agent-filter" aria-label="Agent Filter">
        <option value="" data-i18n="allAgents">All Agents</option>
      </select>
      <button onclick="callAPI('discover')" class="primary" data-i18n="scanLocal">Refresh Skill Library</button>
      <button onclick="handleExport()" data-i18n="exportButton">Export</button>
    </div>
    <div id="discover-summary"></div>
    <div id="discover-table"></div>
    <div id="discover-pagination"></div>
  </div>

  <div id="skill-action-card" class="card">
    <div class="card-header">
      <h2 data-i18n="operationsHeading">Operations</h2>
    </div>

    <div id="panel-selection-info">
      <div id="panel-no-selection" class="panel-hint" data-i18n="noSelectionHint">Select skills from the library to perform operations.</div>
    </div>

    <div id="panel-single" style="display:none;">
      <h3 data-i18n="singleSkillHeading">Single Skill</h3>
      <div id="selected-skill-title" class="selected-skill-name">&mdash;</div>
      <div id="selected-skill-meta" class="selected-skill-info"></div>

      <h3 data-i18n="targetAgentHeading">Target Agent</h3>
      <select id="target-agent-select" aria-label="Target Agent"></select>

      <h3 data-i18n="compatibilityHeading">Compatibility</h3>
      <div class="action-buttons">
        <button onclick="callAPI('compat')" data-i18n="checkButton">Check</button>
      </div>
      <div id="compat-result-card"></div>

      <h3 data-i18n="mappingHeading">Mapping</h3>
      <div class="action-buttons">
        <button onclick="callAPI('map')" class="primary" data-i18n="mapButton">Map to Agent</button>
        <button onclick="callAPI('unmap')" class="danger" data-i18n="unmapButton">Unmap</button>
        <button onclick="callAPI('adopt')" data-i18n="adoptButton">Adopt</button>
      </div>

      <h3 data-i18n="taskSuggestionsHeading">Task Suggestions</h3>
      <div class="task-suggestions-muted">
        <button onclick="callAPI('doctor')" data-i18n="doctorButton">Run Doctor</button>
        <button onclick="callAPI('rollback')" class="danger" data-i18n="rollbackButton">Rollback Last</button>
      </div>
    </div>

    <div id="panel-multi" style="display:none;">
      <h3 id="panel-multi-heading" data-i18n="multiSkillHeading">Multi-Skill</h3>
      <div id="panel-multi-count" class="selected-skill-info"></div>

      <h3 data-i18n="targetAgentHeading">Target Agent</h3>
      <select id="target-agent-select-multi" aria-label="Target Agent"></select>

      <div class="action-buttons batch-actions">
        <button onclick="batchCheckCompat()" data-i18n="batchCheckCompat">Batch Check</button>
        <button onclick="batchMap()" class="primary" data-i18n="batchMap">Batch Map</button>
        <button onclick="batchUnmap()" class="danger" data-i18n="batchUnmap">Batch Unmap</button>
        <button onclick="batchAdopt()" data-i18n="batchAdopt">Batch Adopt</button>
      </div>
      <div class="action-buttons">
        <button onclick="deselectAll()" data-i18n="deselectAll">Deselect</button>
      </div>
    </div>

    <div id="result-display"></div>
  </div>
</div>

<details id="system-diagnostics-drawer">
  <summary data-i18n="diagnosticsHeading">Diagnostics</summary>
  <div class="diagnostics-content">
    <h3 data-i18n="outputHeading">Output</h3>
    <details id="raw-output-details">
      <summary data-i18n="outputSummary">Raw Output</summary>
      <pre id="output" data-i18n="outputEmpty">Click a button to see results.</pre>
    </details>
  </div>
</details>

<script>
${controlPanelClientScript}
</script>
</body>
</html>`;
}
