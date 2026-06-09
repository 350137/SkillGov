// API index — detects Tauri environment and exports the appropriate API implementation.
import { webApi } from './controlPanelApi';
import { desktopApi } from './desktopApi';

function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

export const api = isTauri() ? desktopApi : webApi;
