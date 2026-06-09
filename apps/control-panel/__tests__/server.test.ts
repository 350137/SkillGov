// Tests for the control panel HTTP server and API endpoint responses.
import http from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startServer } from '../server.js';

let server: http.Server;
const PORT = 4190;
const BASE = `http://localhost:${PORT}`;

function fetchJson(path: string, body?: Record<string, unknown>): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const url = `${BASE}${path}`;
    const options: http.RequestOptions = body
      ? { method: 'POST', headers: { 'Content-Type': 'application/json' } }
      : { method: 'GET' };

    const req = http.request(url, options, (res) => {
      let data = '';
      res.on('data', (chunk: string) => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          reject(new Error(`Invalid JSON: ${data}`));
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

beforeAll(() => {
  server = startServer(PORT);
});

afterAll(() => {
  server.close();
});

describe('Control Panel API', () => {
  it('serves HTML at GET /', async () => {
    const res = await new Promise<string>((resolve, reject) => {
      http
        .get(`${BASE}/`, (res) => {
          let data = '';
          res.on('data', (chunk: string) => {
            data += chunk;
          });
          res.on('end', () => resolve(data));
        })
        .on('error', reject);
    });
    expect(res).toContain('SkillGov Control Panel');
    // SPA serves a minimal shell with root div; legacy page has inline content
    expect(res).toContain('<!DOCTYPE html>');
  });

  it('serves a language switcher with Chinese and English labels', async () => {
    const res = await new Promise<string>((resolve, reject) => {
      http
        .get(`${BASE}/`, (res) => {
          let data = '';
          res.on('data', (chunk: string) => {
            data += chunk;
          });
          res.on('end', () => resolve(data));
        })
        .on('error', reject);
    });

    // SPA shell contains the root div and script; language switcher is rendered client-side
    expect(res).toContain('<div id="root"></div>');
    expect(res).toContain('SkillGov Control Panel');
  });

  it('serves the SPA shell with root div and script module', async () => {
    const res = await new Promise<string>((resolve, reject) => {
      http
        .get(`${BASE}/`, (res) => {
          let data = '';
          res.on('data', (chunk: string) => {
            data += chunk;
          });
          res.on('end', () => resolve(data));
        })
        .on('error', reject);
    });

    expect(res).toContain('<div id="root"></div>');
    expect(res).toContain('type="module"');
  });

  it('returns status at POST /api/status', async () => {
    const data = await fetchJson('/api/status');
    expect(data).toHaveProperty('app', 'SkillGov');
    expect(data).toHaveProperty('projectRoot');
    expect(data).toHaveProperty('skills');
    expect(data).toHaveProperty('installs');
  });

  it('returns fixed-length JSON for status health checks', async () => {
    const headers = await new Promise<http.IncomingHttpHeaders>((resolve, reject) => {
      http
        .get(`${BASE}/api/status`, (res) => {
          res.resume();
          res.on('end', () => resolve(res.headers));
        })
        .on('error', reject);
    });

    expect(headers['content-length']).toBeDefined();
    expect(headers['transfer-encoding']).toBeUndefined();
  });

  it('returns error for validate without path', async () => {
    const data = await fetchJson('/api/validate', {});
    expect(data).toHaveProperty('error');
  });

  it('returns error for import without sourcePath', async () => {
    const data = await fetchJson('/api/import', {});
    expect(data).toHaveProperty('error');
  });

  it('returns error for compat without args', async () => {
    const data = await fetchJson('/api/compat', {});
    expect(data).toHaveProperty('error');
  });

  it('returns error for install without args', async () => {
    const data = await fetchJson('/api/install', {});
    expect(data).toHaveProperty('error');
  });

  it('returns error for uninstall without args', async () => {
    const data = await fetchJson('/api/uninstall', {});
    expect(data).toHaveProperty('error');
  });

  it('returns error for task/repair without path', async () => {
    const data = await fetchJson('/api/task/repair', {});
    expect(data).toHaveProperty('error');
  });

  it('returns error for task/overlay without args', async () => {
    const data = await fetchJson('/api/task/overlay', {});
    expect(data).toHaveProperty('error');
  });

  it('returns doctor report at POST /api/doctor', async () => {
    const data = await fetchJson('/api/doctor');
    expect(data).toHaveProperty('issues');
  });

  it('returns error for rollback without target', async () => {
    const data = await fetchJson('/api/rollback', {});
    expect(data).toHaveProperty('error');
  });

  it('returns 404 for unknown route', async () => {
    const data = await fetchJson('/api/unknown');
    expect(data).toHaveProperty('error');
    expect((data as { error: string }).error).toContain('Unknown API');
  });

  it('returns discover results at POST /api/discover', async () => {
    const data = await fetchJson('/api/discover');
    expect(data).toHaveProperty('skills');
    expect(data).toHaveProperty('nonSkillDirectories');
    expect(Array.isArray(data.skills)).toBe(true);
    expect(Array.isArray(data.nonSkillDirectories)).toBe(true);
    const skills = data.skills as Array<Record<string, unknown>>;
    expect(skills.every((skill) => skill.source !== 'codex-plugin-cache')).toBe(true);
    for (const skill of skills) {
      expect(skill).toHaveProperty('sourceLabel');
      expect(skill).toHaveProperty('displayDescription');
      expect(Array.isArray(skill.agentStates)).toBe(true);
    }
  });

  it('redirects browser GET /api/discover to the control panel discover view', async () => {
    const res = await new Promise<http.IncomingMessage>((resolve, reject) => {
      const req = http.request(
        `${BASE}/api/discover`,
        { method: 'GET', headers: { Accept: 'text/html' } },
        resolve,
      );
      req.on('error', reject);
      req.end();
    });

    expect(res.statusCode).toBe(303);
    expect(res.headers.location).toBe('/?discover=1');
  });

  it('returns discover/import results at POST /api/discover/import', async () => {
    const data = await fetchJson('/api/discover/import');
    expect(data).toHaveProperty('total');
    expect(data).toHaveProperty('imported');
    expect(data).toHaveProperty('results');
  });

  it('returns target profiles at GET /api/targets', async () => {
    const data = await fetchJson('/api/targets');
    expect(data).toHaveProperty('targets');
    const targets = data.targets as Array<Record<string, unknown>>;
    expect(Array.isArray(targets)).toBe(true);
    expect(targets.length).toBeGreaterThanOrEqual(2);
    for (const target of targets) {
      expect(target).toHaveProperty('id');
      expect(target).toHaveProperty('label');
      expect(target).toHaveProperty('skillDirs');
      expect(target).toHaveProperty('linkMode');
      expect(Array.isArray(target.skillDirs)).toBe(true);
    }
    const ids = targets.map((t) => t.id);
    expect(ids).toContain('codex');
    expect(ids).toContain('claude');
  });

  it('includes targetProfiles in /api/status response', async () => {
    const data = await fetchJson('/api/status');
    expect(data).toHaveProperty('targetProfiles');
    expect(data).toHaveProperty('skills');
    const profiles = data.targetProfiles as Array<Record<string, unknown>>;
    expect(Array.isArray(profiles)).toBe(true);
    expect(profiles.length).toBeGreaterThanOrEqual(2);
  });

  it('includes targetProfiles in /api/discover response', async () => {
    const data = await fetchJson('/api/discover');
    expect(data).toHaveProperty('targetProfiles');
    expect(data).toHaveProperty('skills');
    const profiles = data.targetProfiles as Array<Record<string, unknown>>;
    expect(Array.isArray(profiles)).toBe(true);
    expect(profiles.length).toBeGreaterThanOrEqual(2);
  });

  it('returns error for compat/batch without skillNames', async () => {
    const data = await fetchJson('/api/compat/batch', { target: 'codex' });
    expect(data).toHaveProperty('error');
  });

  it('returns error for compat/batch without target', async () => {
    const data = await fetchJson('/api/compat/batch', { skillNames: ['x'] });
    expect(data).toHaveProperty('error');
  });

  it('returns error for install/batch without skillNames', async () => {
    const data = await fetchJson('/api/install/batch', { target: 'codex' });
    expect(data).toHaveProperty('error');
  });

  it('returns error for install/batch without target', async () => {
    const data = await fetchJson('/api/install/batch', { skillNames: ['x'] });
    expect(data).toHaveProperty('error');
  });

  it('returns error for uninstall/batch without skillNames', async () => {
    const data = await fetchJson('/api/uninstall/batch', { target: 'codex' });
    expect(data).toHaveProperty('error');
  });

  it('returns error for uninstall/batch without target', async () => {
    const data = await fetchJson('/api/uninstall/batch', { skillNames: ['x'] });
    expect(data).toHaveProperty('error');
  });

  it('returns batch compat results with summary and results array', async () => {
    const data = await fetchJson('/api/compat/batch', {
      skillNames: ['nonexistent-skill'],
      target: 'codex',
    });
    expect(data).toHaveProperty('summary');
    expect(data).toHaveProperty('results');
    const summary = data.summary as Record<string, unknown>;
    expect(summary.total).toBe(1);
    expect(Array.isArray(data.results)).toBe(true);
    const results = data.results as Array<Record<string, unknown>>;
    expect(results.length).toBe(1);
    expect(results[0].name).toBe('nonexistent-skill');
    expect(results[0]).toHaveProperty('status');
  });

  it('returns batch install results with total and results array', async () => {
    const data = await fetchJson('/api/install/batch', {
      skillNames: ['nonexistent-skill'],
      target: 'codex',
    });
    expect(data).toHaveProperty('total');
    expect(data).toHaveProperty('results');
    const results = data.results as Array<Record<string, unknown>>;
    expect(results.length).toBe(1);
    expect(results[0]).toHaveProperty('name');
    expect(results[0]).toHaveProperty('status');
  });

  it('returns batch uninstall results with total and results array', async () => {
    const data = await fetchJson('/api/uninstall/batch', {
      skillNames: ['nonexistent-skill'],
      target: 'codex',
    });
    expect(data).toHaveProperty('total');
    expect(data).toHaveProperty('results');
    const results = data.results as Array<Record<string, unknown>>;
    expect(results.length).toBe(1);
    expect(results[0]).toHaveProperty('name');
    expect(results[0]).toHaveProperty('status');
  });

  it('serves the SPA with React app script', async () => {
    const res = await new Promise<string>((resolve, reject) => {
      http
        .get(`${BASE}/`, (res) => {
          let data = '';
          res.on('data', (chunk: string) => {
            data += chunk;
          });
          res.on('end', () => resolve(data));
        })
        .on('error', reject);
    });
    // SPA shell: minimal HTML with root div and module script
    expect(res).toContain('<div id="root"></div>');
    expect(res).toContain('type="module"');
    expect(res).not.toContain('data-i18n="importValidateHeading"');
  });

  it('returns error for map without skillName', async () => {
    const data = await fetchJson('/api/map', { target: 'codex' });
    expect(data).toHaveProperty('error');
  });

  it('returns error for map without target', async () => {
    const data = await fetchJson('/api/map', { skillName: 'x' });
    expect(data).toHaveProperty('error');
  });

  it('returns not-found for map with nonexistent skill', async () => {
    const data = await fetchJson('/api/map', { skillName: 'nonexistent', target: 'codex' });
    expect(data.status).toBe('not-found');
    expect(data).toHaveProperty('message');
  });

  it('returns error for unmap without args', async () => {
    const data = await fetchJson('/api/unmap', {});
    expect(data).toHaveProperty('error');
  });

  it('returns error for adopt without args', async () => {
    const data = await fetchJson('/api/adopt', {});
    expect(data).toHaveProperty('error');
  });

  it('marks legacy install response with legacy flag', async () => {
    const data = await fetchJson('/api/install', { skillName: 'nonexistent', target: 'codex' });
    expect(data).toHaveProperty('legacy', true);
  });

  it('marks legacy uninstall response with legacy flag', async () => {
    const data = await fetchJson('/api/uninstall', { skillName: 'nonexistent', target: 'codex' });
    expect(data).toHaveProperty('legacy', true);
  });

  it('returns error for map/batch without skillNames', async () => {
    const data = await fetchJson('/api/map/batch', { target: 'codex' });
    expect(data).toHaveProperty('error');
  });

  it('returns error for map/batch without target', async () => {
    const data = await fetchJson('/api/map/batch', { skillNames: ['x'] });
    expect(data).toHaveProperty('error');
  });

  it('returns summary and results for map/batch', async () => {
    const data = await fetchJson('/api/map/batch', {
      skillNames: ['nonexistent-skill'],
      target: 'codex',
    });
    expect(data).toHaveProperty('summary');
    expect(data).toHaveProperty('results');
    const summary = data.summary as Record<string, unknown>;
    expect(summary.total).toBe(1);
    expect(summary.notFound).toBe(1);
    const results = data.results as Array<Record<string, unknown>>;
    expect(results.length).toBe(1);
    expect(results[0].name).toBe('nonexistent-skill');
    expect(results[0].status).toBe('not-found');
    expect(results[0]).toHaveProperty('message');
  });

  it('returns summary and results for unmap/batch', async () => {
    const data = await fetchJson('/api/unmap/batch', {
      skillNames: ['nonexistent-skill'],
      target: 'codex',
    });
    expect(data).toHaveProperty('summary');
    expect(data).toHaveProperty('results');
    const summary = data.summary as Record<string, unknown>;
    expect(summary.total).toBe(1);
    expect(summary.notFound).toBe(1);
  });

  it('returns summary and results for adopt/batch', async () => {
    const data = await fetchJson('/api/adopt/batch', {
      skillNames: ['nonexistent-skill'],
      target: 'codex',
    });
    expect(data).toHaveProperty('summary');
    expect(data).toHaveProperty('results');
    const summary = data.summary as Record<string, unknown>;
    expect(summary.total).toBe(1);
    expect(summary.notFound).toBe(1);
  });

  it('returns error for unmap/batch without args', async () => {
    const data = await fetchJson('/api/unmap/batch', {});
    expect(data).toHaveProperty('error');
  });

  it('returns error for adopt/batch without args', async () => {
    const data = await fetchJson('/api/adopt/batch', {});
    expect(data).toHaveProperty('error');
  });
});
