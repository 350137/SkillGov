// Tests for the control panel HTTP server and API endpoint responses.
import http from 'node:http';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { startServer } from '../server.js';

let server: http.Server;
const PORT = 4190;
const BASE = `http://127.0.0.1:${PORT}`;
let sessionCookie = '';
const originalFetch = globalThis.fetch;

function requestText(
  path: string,
  options: http.RequestOptions = {},
  body?: string,
): Promise<{ statusCode: number; headers: http.IncomingHttpHeaders; text: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request(`${BASE}${path}`, options, (res) => {
      let data = '';
      res.on('data', (chunk: string) => {
        data += chunk;
      });
      res.on('end', () =>
        resolve({ statusCode: res.statusCode || 0, headers: res.headers, text: data }),
      );
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function refreshSessionCookie(): Promise<void> {
  const res = await requestText('/');
  const setCookie = res.headers['set-cookie'];
  sessionCookie = Array.isArray(setCookie) ? setCookie[0].split(';')[0] : '';
}

function fetchJson(path: string, body?: Record<string, unknown>): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const url = `${BASE}${path}`;
    const options: http.RequestOptions = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(sessionCookie ? { Cookie: sessionCookie } : {}),
      },
    };

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
    req.write(JSON.stringify(body ?? {}));
    req.end();
  });
}

beforeAll(async () => {
  server = startServer(PORT);
  await refreshSessionCookie();
});

afterAll(() => {
  server.close();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
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

  it('sets a strict local session cookie for API requests', async () => {
    const res = await requestText('/');
    const setCookie = res.headers['set-cookie'];

    expect(Array.isArray(setCookie)).toBe(true);
    expect(setCookie?.[0]).toContain('skillgov_session=');
    expect(setCookie?.[0]).toContain('HttpOnly');
    expect(setCookie?.[0]).toContain('SameSite=Strict');
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

  it('rejects cross-origin API requests', async () => {
    const res = await requestText(
      '/api/map',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'https://evil.example',
        },
      },
      JSON.stringify({ skillName: 'nonexistent', target: 'codex' }),
    );

    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.text)).toHaveProperty('error');
  });

  it('rejects POST API requests without the local session cookie', async () => {
    const res = await requestText(
      '/api/map',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      },
      JSON.stringify({ skillName: 'nonexistent', target: 'codex' }),
    );

    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.text)).toHaveProperty('error');
  });

  it('rejects API requests with oversized JSON bodies', async () => {
    const res = await requestText(
      '/api/status',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: sessionCookie,
        },
      },
      JSON.stringify({ payload: 'x'.repeat(1_100_000) }),
    );

    expect(res.statusCode).toBe(413);
    expect(JSON.parse(res.text)).toHaveProperty('error');
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

  it('returns error for remote/search without query', async () => {
    const data = await fetchJson('/api/remote/search', {});
    expect(data).toHaveProperty('error');
    expect((data as { error: string }).error).toContain('query');
  });

  it('returns error for remote/search with non-string query', async () => {
    const res = await requestText(
      '/api/remote/search',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: sessionCookie,
        },
      },
      JSON.stringify({ query: 123 }),
    );
    const data = JSON.parse(res.text);
    expect(res.statusCode).toBe(200);
    expect(data).toHaveProperty('error');
    expect((data as { error: string }).error).toContain('query');
  });

  it('returns error for remote/preview without remoteId', async () => {
    const data = await fetchJson('/api/remote/preview', {});
    expect(data).toHaveProperty('error');
    expect((data as { error: string }).error).toContain('remoteId');
  });

  it('returns error for remote/preview with non-string remoteId', async () => {
    const res = await requestText(
      '/api/remote/preview',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: sessionCookie,
        },
      },
      JSON.stringify({ remoteId: 123 }),
    );
    const data = JSON.parse(res.text);
    expect(res.statusCode).toBe(200);
    expect(data).toHaveProperty('error');
    expect((data as { error: string }).error).toContain('remoteId');
  });

  it('returns error for remote/install without remoteId', async () => {
    const data = await fetchJson('/api/remote/install', {});
    expect(data).toHaveProperty('error');
    expect((data as { error: string }).error).toContain('remoteId');
  });

  it('returns error for remote/install with non-string remoteId', async () => {
    const res = await requestText(
      '/api/remote/install',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: sessionCookie,
        },
      },
      JSON.stringify({ remoteId: 123 }),
    );
    const data = JSON.parse(res.text);
    expect(res.statusCode).toBe(200);
    expect(data).toHaveProperty('error');
    expect((data as { error: string }).error).toContain('remoteId');
  });

  it('rejects remote API requests without the local session cookie', async () => {
    const res = await requestText(
      '/api/remote/search',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      },
      JSON.stringify({ query: 'typescript' }),
    );

    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.text)).toHaveProperty('error');
  });

  it('returns normalized remote search results', async () => {
    let requestedUrl = '';
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      requestedUrl = String(input);
      return {
        ok: true,
        status: 200,
        json: async () => ({
          skills: [
            {
              id: 'github/awesome-copilot/javascript-typescript-jest',
              skillId: 'javascript-typescript-jest',
              name: 'javascript-typescript-jest',
              installs: 11038,
              source: 'github/awesome-copilot',
            },
          ],
        }),
      } as Response;
    }) as typeof fetch;

    const data = await fetchJson('/api/remote/search', { query: 'typescript', limit: 100 });

    expect(requestedUrl).toContain('https://skills.sh/api/search');
    expect(requestedUrl).toContain('q=typescript');
    expect(requestedUrl).toContain('limit=50');
    expect(data).toMatchObject({
      query: 'typescript',
      source: 'skills.sh',
      count: 1,
      skills: [
        {
          id: 'github/awesome-copilot/javascript-typescript-jest',
          skillId: 'javascript-typescript-jest',
          name: 'javascript-typescript-jest',
          installs: 11038,
          source: 'github/awesome-copilot',
        },
      ],
    });
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

  it('rejects legacy batch install API', async () => {
    const res = await requestText(
      '/api/install/batch',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: sessionCookie,
        },
      },
      JSON.stringify({ skillNames: ['nonexistent-skill'], target: 'codex' }),
    );

    expect(res.statusCode).toBe(410);
    expect(JSON.parse(res.text)).toMatchObject({ error: expect.stringContaining('map/batch') });
  });

  it('rejects legacy batch uninstall API', async () => {
    const res = await requestText(
      '/api/uninstall/batch',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: sessionCookie,
        },
      },
      JSON.stringify({ skillNames: ['nonexistent-skill'], target: 'codex' }),
    );

    expect(res.statusCode).toBe(410);
    expect(JSON.parse(res.text)).toMatchObject({ error: expect.stringContaining('unmap/batch') });
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

  it('rejects legacy install API', async () => {
    const res = await requestText(
      '/api/install',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: sessionCookie,
        },
      },
      JSON.stringify({ skillName: 'nonexistent', target: 'codex' }),
    );

    expect(res.statusCode).toBe(410);
    expect(JSON.parse(res.text)).toMatchObject({ error: expect.stringContaining('map') });
  });

  it('rejects legacy uninstall API', async () => {
    const res = await requestText(
      '/api/uninstall',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: sessionCookie,
        },
      },
      JSON.stringify({ skillName: 'nonexistent', target: 'codex' }),
    );

    expect(res.statusCode).toBe(410);
    expect(JSON.parse(res.text)).toMatchObject({ error: expect.stringContaining('unmap') });
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
