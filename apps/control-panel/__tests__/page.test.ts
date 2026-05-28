// Tests that the control panel HTML page uses a two-pane layout with skill library and action panel.
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

describe('two-pane layout structure', () => {
  it('contains skill-library-pane and skill-action-pane', () => {
    expect(bodyHtml).toContain('id="skill-library-pane"');
    expect(bodyHtml).toContain('id="skill-action-pane"');
  });

  it('contains required action panel element IDs', () => {
    expect(bodyHtml).toContain('id="target-agent-select"');
    expect(bodyHtml).toContain('id="selected-skill-title"');
    expect(bodyHtml).toContain('id="selected-skill-meta"');
    expect(bodyHtml).toContain('id="compat-result-card"');
    expect(bodyHtml).toContain('id="raw-output-details"');
    expect(bodyHtml).toContain('id="system-diagnostics-panel"');
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
  });

  it('target-agent-select is an empty select placeholder for future dynamic agents', () => {
    expect(bodyHtml).toMatch(/<select[^>]*id="target-agent-select"[^>]*>\s*<\/select>/);
  });

  it('system-diagnostics-panel is a collapsed details element', () => {
    expect(bodyHtml).toMatch(/<details[^>]*id="system-diagnostics-panel"[\s\S]*?<\/details>/);
    expect(bodyHtml).toContain('<summary');
  });
});
