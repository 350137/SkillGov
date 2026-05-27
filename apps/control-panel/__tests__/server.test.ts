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
    expect(res).toContain('Refresh Status');
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

    expect(res).toContain('id="language-select"');
    expect(res).toContain('中文');
    expect(res).toContain('English');
    expect(res).toContain('data-i18n="refreshStatus"');
  });

  it('places the language switcher in the top-right header actions area', async () => {
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

    expect(res).toContain('class="page-header"');
    expect(res).toContain('class="header-actions"');
    expect(res).toMatch(/<div class="header-actions">[\s\S]*id="language-select"[\s\S]*<\/div>/);
  });

  it('returns status at POST /api/status', async () => {
    const data = await fetchJson('/api/status');
    expect(data).toHaveProperty('projectRoot');
    expect(data).toHaveProperty('skills');
    expect(data).toHaveProperty('installs');
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
    expect(Array.isArray(data.skills)).toBe(true);
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

  it('includes Scan Local Skills button in HTML', async () => {
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
    expect(res).toContain('data-i18n="scanLocal"');
    expect(res).toContain('data-i18n="importPassed"');
    expect(res).toContain('id="discover-table"');
    expect(res).toContain('id="status-summary"');
    expect(res).toContain('id="discover-summary"');
    expect(res).toContain('id="discover-pagination"');
    expect(res).toContain("searchParams.get('discover') === '1'");
    expect(res).toContain('totalManaged');
    expect(res).toContain('validationPass');
    expect(res).toContain('prevPage');
    expect(res).toContain('nextPage');
    expect(res).toContain('changeDiscoverPage');
  });
});
