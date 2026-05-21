// Local web control panel server — provides a button-based UI over @skillgov/core operations via HTTP API endpoints.
import { existsSync, readFileSync } from 'node:fs';
import http from 'node:http';
import { URL } from 'node:url';
import {
  VERSION,
  checkCompatibility,
  generateOverlayTask,
  generateRepairTask,
  getProjectStatus,
  importSkill,
  initProject,
  installSkill,
  loadConfig,
  rollbackLastInstall,
  runDoctor,
  uninstallSkill,
  validateSkill,
} from '@skillgov/core';

const PORT = Number.parseInt(process.env.PORT || '4173', 10);

type ApiHandler = (
  body: Record<string, unknown>,
) => Promise<Record<string, unknown>> | Record<string, unknown>;

const apiRoutes: Record<string, ApiHandler> = {
  status: () => {
    const config = loadConfig();
    const status = getProjectStatus(config.projectRoot);
    return status as unknown as Record<string, unknown>;
  },

  validate: (body) => {
    const path = body.path as string;
    if (!path) return { error: 'Missing "path" field' };
    const result = validateSkill(path);
    return result as unknown as Record<string, unknown>;
  },

  import: (body) => {
    const sourcePath = body.sourcePath as string;
    if (!sourcePath) return { error: 'Missing "sourcePath" field' };
    const config = loadConfig();
    const incoming = `${config.projectRoot}/incoming`;
    const skills = `${config.projectRoot}/skills`;
    try {
      return importSkill(sourcePath, { incoming, skills }) as unknown as Record<string, unknown>;
    } catch (err) {
      return { status: 'fail', message: (err as Error).message };
    }
  },

  compat: (body) => {
    const skillPath = body.skillPath as string;
    const target = body.target as string;
    if (!skillPath || !target) return { error: 'Missing "skillPath" or "target" field' };
    return checkCompatibility(skillPath, target) as unknown as Record<string, unknown>;
  },

  install: (body) => {
    const skillName = body.skillName as string;
    const target = body.target as string;
    if (!skillName || !target) return { error: 'Missing "skillName" or "target" field' };
    const config = loadConfig();
    return installSkill(skillName, target, config.defaultLinkMode, {
      projectRoot: config.projectRoot,
      registryPath: `${config.projectRoot}/registry/installs.json`,
      operationsPath: `${config.projectRoot}/registry/operations.jsonl`,
    }) as unknown as Record<string, unknown>;
  },

  uninstall: (body) => {
    const skillName = body.skillName as string;
    const target = body.target as string;
    if (!skillName || !target) return { error: 'Missing "skillName" or "target" field' };
    const config = loadConfig();
    return uninstallSkill(skillName, target, {
      projectRoot: config.projectRoot,
      registryPath: `${config.projectRoot}/registry/installs.json`,
      operationsPath: `${config.projectRoot}/registry/operations.jsonl`,
    }) as unknown as Record<string, unknown>;
  },

  'task/repair': (body) => {
    const skillPath = body.skillPath as string;
    if (!skillPath) return { error: 'Missing "skillPath" field' };
    const validation = validateSkill(skillPath);
    if (validation.status !== 'fixable') {
      return { error: `Skill status is "${validation.status}", expected "fixable"` };
    }
    return generateRepairTask({ skillPath, validation }) as unknown as Record<string, unknown>;
  },

  'task/overlay': (body) => {
    const skillPath = body.skillPath as string;
    const target = body.target as string;
    if (!skillPath || !target) return { error: 'Missing "skillPath" or "target" field' };
    const compatResult = checkCompatibility(skillPath, target);
    if (compatResult.status !== 'needs-overlay') {
      return { error: `Status is "${compatResult.status}", expected "needs-overlay"` };
    }
    return generateOverlayTask({
      skillPath,
      targetName: target,
      compatResult,
    }) as unknown as Record<string, unknown>;
  },

  doctor: () => {
    const config = loadConfig();
    return runDoctor(config.projectRoot) as unknown as Record<string, unknown>;
  },

  rollback: (body) => {
    const target = body.target as string;
    if (!target) return { error: 'Missing "target" field' };
    const config = loadConfig();
    return rollbackLastInstall(target, {
      projectRoot: config.projectRoot,
      registryPath: `${config.projectRoot}/registry/installs.json`,
      operationsPath: `${config.projectRoot}/registry/operations.jsonl`,
    }) as unknown as Record<string, unknown>;
  },
};

const HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>SkillGov Control Panel</title>
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; color: #333; padding: 20px; max-width: 960px; margin: 0 auto; }
h1 { font-size: 1.5rem; margin-bottom: 8px; }
h2 { font-size: 1.1rem; margin: 20px 0 10px; border-bottom: 1px solid #ddd; padding-bottom: 4px; }
.subtitle { color: #666; font-size: 0.85rem; margin-bottom: 20px; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 8px; margin-bottom: 20px; }
button { padding: 10px 16px; border: 1px solid #ccc; border-radius: 6px; background: #fff; cursor: pointer; font-size: 0.85rem; transition: background 0.15s; }
button:hover { background: #e8e8e8; }
button.primary { background: #0066cc; color: #fff; border-color: #0055aa; }
button.primary:hover { background: #0055aa; }
button.danger { background: #cc3300; color: #fff; border-color: #aa2a00; }
button.danger:hover { background: #aa2a00; }
button:disabled { opacity: 0.5; cursor: default; }
.field-row { display: flex; gap: 8px; margin-bottom: 8px; align-items: center; }
.field-row input, .field-row select { padding: 8px; border: 1px solid #ccc; border-radius: 4px; flex: 1; font-size: 0.85rem; }
pre { background: #1e1e1e; color: #d4d4d4; padding: 12px; border-radius: 6px; overflow-x: auto; font-size: 0.8rem; max-height: 400px; overflow-y: auto; }
#output { margin-top: 20px; }
table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
th, td { padding: 8px 10px; text-align: left; border-bottom: 1px solid #eee; }
th { font-weight: 600; background: #fafafa; }
.status-badge { display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 0.75rem; font-weight: 600; }
.status-pass { background: #d4edda; color: #155724; }
.status-fail { background: #f8d7da; color: #721c24; }
.status-fixable { background: #fff3cd; color: #856404; }
</style>
</head>
<body>
<h1>SkillGov Control Panel</h1>
<div class="subtitle">v${VERSION} — <span id="project-path"></span></div>

<h2>Status</h2>
<div class="grid">
  <button onclick="callAPI('status')" class="primary">Refresh Status</button>
</div>
<div id="status-table"></div>

<h2>Import & Validate</h2>
<div class="field-row">
  <input id="import-path" placeholder="Path to skill directory..." />
  <button onclick="callAPI('import')">Import</button>
</div>
<div class="field-row">
  <input id="validate-path" placeholder="Path to skill..." />
  <button onclick="callAPI('validate')">Validate</button>
</div>

<h2>Compatibility</h2>
<div class="field-row">
  <input id="compat-path" placeholder="Skill path..." />
  <select id="compat-target"><option value="claude">Claude</option><option value="codex">Codex</option></select>
  <button onclick="callAPI('compat')">Check</button>
</div>

<h2>Install / Uninstall</h2>
<div class="field-row">
  <input id="install-skill" placeholder="Skill name..." />
  <select id="install-target"><option value="claude">Claude</option><option value="codex">Codex</option></select>
  <button onclick="callAPI('install')" class="primary">Install</button>
  <button onclick="callAPI('uninstall')" class="danger">Uninstall</button>
</div>

<h2>Tasks</h2>
<div class="field-row">
  <input id="task-path" placeholder="Skill path..." />
  <select id="task-target"><option value="claude">Claude</option><option value="codex">Codex</option></select>
  <button onclick="callAPI('task/repair')">Repair Task</button>
  <button onclick="callAPI('task/overlay')">Overlay Task</button>
</div>

<h2>Diagnostics</h2>
<div class="grid">
  <button onclick="callAPI('doctor')">Run Doctor</button>
  <button onclick="callAPI('rollback')" class="danger">Rollback Last</button>
</div>

<h2>Output</h2>
<pre id="output">Click a button to see results.</pre>

<script>
async function callAPI(endpoint) {
  const output = document.getElementById('output');
  output.textContent = 'Loading...';

  const body = {};
  const fields = {
    import: { path: 'import-path' },
    validate: { path: 'validate-path' },
    compat: { skillPath: 'compat-path', target: 'compat-target' },
    install: { skillName: 'install-skill', target: 'install-target' },
    uninstall: { skillName: 'install-skill', target: 'install-target' },
    'task/repair': { skillPath: 'task-path' },
    'task/overlay': { skillPath: 'task-path', target: 'task-target' },
    rollback: { target: 'install-target' },
  };

  if (fields[endpoint]) {
    for (const [key, elId] of Object.entries(fields[endpoint])) {
      const el = document.getElementById(elId);
      if (el) body[key] = el.value || el.value;
    }
  }

  try {
    const res = await fetch('/api/' + endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    output.textContent = JSON.stringify(data, null, 2);
  } catch (err) {
    output.textContent = 'Error: ' + err.message;
  }
}

// Load initial status
window.addEventListener('DOMContentLoaded', () => {
  const pp = document.getElementById('project-path');
  fetch('/api/status')
    .then(r => r.json())
    .then(data => {
      pp.textContent = data.projectRoot || '(no project)';
      const table = document.getElementById('status-table');
      const rows = (data.skills || []).map(s => \`<tr><td>\${s.name}</td><td>\${s.hasOverlay ? 'Yes' : 'No'}</td><td>\${s.overlayTargets.join(', ') || '-'}</td></tr>\`).join('');
      table.innerHTML = \`<table><thead><tr><th>Skill</th><th>Overlay</th><th>Targets</th></tr></thead><tbody>\${rows || '<tr><td colspan="3">No skills found.</td></tr>'}</tbody></table>\`;
    })
    .catch(() => { pp.textContent = 'Could not load status'; });
});
</script>
</body>
</html>`;

function parseBody(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (chunk: string) => {
      data += chunk;
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(data));
      } catch {
        resolve({});
      }
    });
  });
}

export function startServer(port: number = PORT): http.Server {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url || '/', `http://${req.headers.host}`);
    const path = url.pathname;

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    // Serve HTML
    if (req.method === 'GET' && path === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(HTML);
      return;
    }

    // API routes — accept both GET and POST
    if ((req.method === 'GET' || req.method === 'POST') && path.startsWith('/api/')) {
      const route = path.slice(5); // Remove '/api/'
      const handler = apiRoutes[route];
      if (!handler) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: `Unknown API: ${route}` }));
        return;
      }
      const body = req.method === 'GET' ? {} : await parseBody(req);
      try {
        const result = handler(body);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: (err as Error).message }));
      }
      return;
    }

    res.writeHead(404);
    res.end('Not found');
  });

  server.listen(port, () => {
    console.log(`SkillGov Control Panel running at http://localhost:${port}`);
  });

  return server;
}

// Auto-start when run directly
if (process.argv[1]?.endsWith('server.ts') || process.argv[1]?.endsWith('server.js')) {
  startServer();
}
