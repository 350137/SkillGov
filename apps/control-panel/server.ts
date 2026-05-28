// Local web control panel server — provides a button-based UI over @skillgov/core operations via HTTP API endpoints.
import http from 'node:http';
import { URL } from 'node:url';
import {
  VERSION,
  checkCompatibility,
  discoverSkillInventory,
  discoverSkills,
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
import { renderControlPanelPage } from './src/page.js';

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
      return importSkill(sourcePath, {
        incoming,
        skills,
        registryPath: `${config.projectRoot}/registry/skills.json`,
      }) as unknown as Record<string, unknown>;
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
      mappingsPath: `${config.projectRoot}/registry/mappings.json`,
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

  discover: () => {
    const config = loadConfig();
    const registryPath = `${config.projectRoot}/registry/skills.json`;
    return discoverSkillInventory({
      projectRoot: config.projectRoot,
      registryPath,
      installsPath: `${config.projectRoot}/registry/installs.json`,
      mappingsPath: `${config.projectRoot}/registry/mappings.json`,
    }) as unknown as Record<string, unknown>;
  },

  'discover/import': () => {
    const config = loadConfig();
    const registryPath = `${config.projectRoot}/registry/skills.json`;
    const incoming = `${config.projectRoot}/incoming`;
    const skills = `${config.projectRoot}/skills`;
    const discovered = discoverSkills({
      projectRoot: config.projectRoot,
      registryPath,
      installsPath: `${config.projectRoot}/registry/installs.json`,
    });
    const passSkills = discovered.filter(
      (s) => s.validationStatus === 'pass' && !s.alreadyImported,
    );

    const results: Array<{ name: string; status: string; message?: string }> = [];
    for (const skill of passSkills) {
      try {
        const result = importSkill(skill.path, {
          incoming,
          skills,
          registryPath,
          origin: skill.source,
        });
        results.push({ name: result.skillName, status: result.status });
      } catch (err) {
        results.push({ name: skill.name, status: 'fail', message: (err as Error).message });
      }
    }

    return {
      total: discovered.length,
      imported: results.filter((r) => r.status === 'pass').length,
      results,
    } as unknown as Record<string, unknown>;
  },
};

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
      res.end(renderControlPanelPage({ version: VERSION }));
      return;
    }

    if (
      req.method === 'GET' &&
      path === '/api/discover' &&
      (req.headers.accept || '').includes('text/html')
    ) {
      res.writeHead(303, { Location: '/?discover=1' });
      res.end();
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
