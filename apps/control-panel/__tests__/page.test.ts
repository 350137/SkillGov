// Tests that the control panel HTML page uses a console layout with status cards, skill library card, and action card.
import { describe, expect, it } from 'vitest';
import { controlPanelClientScript } from '../src/client-script.js';
import { translations } from '../src/i18n.js';
import { renderControlPanelPage } from '../src/page.js';
import { controlPanelStyles } from '../src/styles.js';

const html = renderControlPanelPage({ version: '0.0-test' });

// Extract only the HTML body (between </style> and <script>) to avoid matching client-script references.
const bodyHtml = html.replace(/^[\s\S]*<\/style>/, '').replace(/<script>[\s\S]*$/, '');

describe('control panel page composition', () => {
  it('renders the page with extracted styles, translations, and client script', () => {
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('v0.0-test');
    expect(html).toContain(`<style>\n${controlPanelStyles}\n</style>`);
    expect(html).toContain(`<script>\n${controlPanelClientScript}\n</script>`);
    expect(html).toContain(translations.en.title);
    expect(html).toContain(translations.zh.title);
  });
});

describe('console layout structure', () => {
  it('contains status-cards, skill-library-card, skill-action-card, and system-diagnostics-drawer', () => {
    expect(bodyHtml).toContain('id="status-cards"');
    expect(bodyHtml).toContain('id="skill-library-card"');
    expect(bodyHtml).toContain('id="skill-action-card"');
    expect(bodyHtml).toContain('id="system-diagnostics-drawer"');
  });

  it('contains toolbar filter elements', () => {
    expect(bodyHtml).toContain('id="skill-search-input"');
    expect(bodyHtml).toContain('id="skill-status-filter"');
    expect(bodyHtml).toContain('id="skill-source-filter"');
    expect(bodyHtml).toContain('id="skill-mapping-filter"');
    expect(bodyHtml).toContain('id="skill-agent-filter"');
  });

  it('contains skill library view switch buttons', () => {
    expect(bodyHtml).toContain('id="library-view-status"');
    expect(bodyHtml).toContain('id="library-view-purpose"');
    expect(bodyHtml).toContain("setLibraryView('status')");
    expect(bodyHtml).toContain("setLibraryView('purpose')");
  });

  it('contains required action card element IDs', () => {
    expect(bodyHtml).toContain('id="target-agent-select"');
    expect(bodyHtml).toContain('id="selected-skill-title"');
    expect(bodyHtml).toContain('id="selected-skill-meta"');
    expect(bodyHtml).toContain('id="compat-result-card"');
  });

  it('contains raw-output-details inside diagnostics drawer', () => {
    expect(bodyHtml).toContain('id="raw-output-details"');
    expect(bodyHtml).toMatch(/<details[^>]*id="system-diagnostics-drawer"[\s\S]*?<\/details>/);
  });

  it('renders selected-skill-title with a valid closing div tag', () => {
    expect(bodyHtml).toMatch(
      /<div id="selected-skill-title" class="selected-skill-name">[\s\S]*?<\/div>/,
    );
  });

  it('does not contain removed legacy element IDs', () => {
    expect(bodyHtml).not.toContain('id="install-skill"');
    expect(bodyHtml).not.toContain('id="task-path"');
    expect(bodyHtml).not.toContain('id="compat-number"');
    expect(bodyHtml).not.toContain('id="compat-target"');
    expect(bodyHtml).not.toContain('id="status-summary"');
  });

  it('target-agent-select is an empty select placeholder', () => {
    expect(bodyHtml).toMatch(/<select[^>]*id="target-agent-select"[^>]*>\s*<\/select>/);
  });

  it('lays out multi-select batch actions in a single action grid', () => {
    expect(bodyHtml).toContain('class="batch-action-grid"');
    expect(bodyHtml).toMatch(/batchAdopt\(\)[\s\S]*deselectAll\(\)/);
  });

  it('system-diagnostics-drawer is a collapsed details element', () => {
    expect(bodyHtml).toMatch(/<details[^>]*id="system-diagnostics-drawer"[\s\S]*?<\/details>/);
    expect(bodyHtml).toContain('<summary');
  });

  it('does not use the old two-pane class', () => {
    expect(bodyHtml).not.toContain('class="two-pane"');
    expect(bodyHtml).not.toContain('class="pane-left"');
    expect(bodyHtml).not.toContain('class="pane-right"');
  });
});

describe('console layout styles', () => {
  it('keeps the operation panel fixed while only result-display scrolls', () => {
    expect(controlPanelStyles).toContain('#skill-action-card');
    expect(controlPanelStyles).toContain('max-height: calc(100vh - 190px)');
    expect(controlPanelStyles).toContain('#result-display');
    expect(controlPanelStyles).toContain('flex: 1');
    expect(controlPanelStyles).toContain('overflow-y: auto');
    expect(controlPanelStyles).toContain('#result-display::-webkit-scrollbar');
  });

  it('defines the requested batch action grid layout', () => {
    expect(controlPanelStyles).toContain('.batch-action-grid');
    expect(controlPanelStyles).toContain('grid-template-columns: repeat(3, minmax(0, 1fr))');
  });
});
