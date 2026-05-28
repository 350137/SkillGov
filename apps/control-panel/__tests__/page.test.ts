// Tests that the control panel HTML page is composed from focused UI modules.
import { describe, expect, it } from 'vitest';
import { controlPanelClientScript } from '../src/client-script.js';
import { translations } from '../src/i18n.js';
import { renderControlPanelPage } from '../src/page.js';
import { controlPanelStyles } from '../src/styles.js';

describe('control panel page composition', () => {
  it('renders the page with extracted styles, translations, and client script', () => {
    const html = renderControlPanelPage({ version: '0.0-test' });

    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('v0.0-test');
    expect(html).toContain(`<style>\n${controlPanelStyles}\n</style>`);
    expect(html).toContain(`<script>\n${controlPanelClientScript}\n</script>`);
    expect(html).toContain(translations.en.title);
    expect(html).toContain(translations.zh.title);
  });
});
