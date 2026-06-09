// Local web control panel server — provides a button-based UI over @skillgov/core operations via HTTP API endpoints.
import { readFileSync } from 'node:fs';
import http from 'node:http';
import { join } from 'node:path';
import { URL } from 'node:url';
import {
  VERSION,
  adoptSkill,
  checkCompatibility,
  discoverSkillInventory,
  discoverSkills,
  emptySkillDescriptionsRegistry,
  generateOverlayTask,
  generateRepairTask,
  getProjectStatus,
  importSkill,
  initProject,
  installSkill,
  listTargetProfiles,
  loadConfig,
  mapSkill,
  parseFrontmatter,
  readSkillDescriptions,
  resolveSkillDescription,
  rollbackLastInstall,
  runDoctor,
  uninstallSkill,
  unmapSkill,
  validateSkill,
} from '@skillgov/core';
import type { SkillDescriptionsRegistry } from '@skillgov/core';
import { renderControlPanelPage } from './src/page.js';

const SPA_ROOT = join(import.meta.dirname, 'dist', 'spa');
let spaIndexHtml: string | null = null;
try {
  spaIndexHtml = readFileSync(join(SPA_ROOT, 'index.html'), 'utf-8');
} catch {
  // SPA not built yet — fall back to legacy page
}

const PORT = Number.parseInt(process.env.PORT || '4173', 10);

type ApiHandler = (
  body: Record<string, unknown>,
) => Promise<Record<string, unknown>> | Record<string, unknown>;

function sendJson(res: http.ServerResponse, statusCode: number, payload: unknown): void {
  const json = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(json, 'utf8'),
  });
  res.end(json);
}

function readDescriptionRegistry(projectRoot: string): SkillDescriptionsRegistry {
  try {
    return readSkillDescriptions(join(projectRoot, 'registry', 'skill-descriptions.json'));
  } catch {
    return emptySkillDescriptionsRegistry();
  }
}

function frontmatterDescription(skillPath: unknown): string {
  if (typeof skillPath !== 'string' || !skillPath) return '';
  const parsed = parseFrontmatter(join(skillPath, 'SKILL.md'));
  return parsed.data.description || '';
}

function withDisplayDescriptions<T extends { name: string; path?: string }>(
  skills: T[],
  registry: SkillDescriptionsRegistry,
): Array<
  T & {
    displayDescription: {
      zh?: string;
      en?: string;
      fallback: string;
      resolvedZh: string;
      resolvedEn: string;
      reviewStatus: string;
      source: string;
    };
  }
> {
  return skills.map((skill) => {
    const entry = registry.descriptions[skill.name];
    const fallback = frontmatterDescription(skill.path);
    return {
      ...skill,
      displayDescription: {
        zh: entry?.zh,
        en: entry?.en,
        fallback,
        resolvedZh: resolveSkillDescription(entry, 'zh', fallback),
        resolvedEn: resolveSkillDescription(entry, 'en', fallback),
        reviewStatus: entry?.reviewStatus || 'missing',
        source: entry?.source || (fallback ? 'frontmatter' : 'manual'),
      },
    };
  });
}

const apiRoutes: Record<string, ApiHandler> = {
  status: () => {
    const config = loadConfig();
    const status = getProjectStatus(config.projectRoot, { targets: config.targets });
    return {
      app: 'SkillGov',
      apiVersion: VERSION,
      ...status,
      targetProfiles: listTargetProfiles(config.targets),
    } as unknown as Record<string, unknown>;
  },

  targets: () => {
    const config = loadConfig();
    return { targets: listTargetProfiles(config.targets) } as unknown as Record<string, unknown>;
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
    const config = loadConfig();
    return checkCompatibility(skillPath, target, {
      targetProfiles: listTargetProfiles(config.targets),
      mappingsPath: `${config.projectRoot}/registry/mappings.json`,
    }) as unknown as Record<string, unknown>;
  },

  install: (body) => {
    const skillName = body.skillName as string;
    const target = body.target as string;
    if (!skillName || !target) return { error: 'Missing "skillName" or "target" field' };
    const config = loadConfig();
    const targetProfiles = listTargetProfiles(config.targets);
    const result = installSkill(skillName, target, config.defaultLinkMode, {
      projectRoot: config.projectRoot,
      operationsPath: `${config.projectRoot}/registry/operations.jsonl`,
      mappingsPath: `${config.projectRoot}/registry/mappings.json`,
      targetProfiles,
    });
    return { ...result, legacy: true } as unknown as Record<string, unknown>;
  },

  uninstall: (body) => {
    const skillName = body.skillName as string;
    const target = body.target as string;
    if (!skillName || !target) return { error: 'Missing "skillName" or "target" field' };
    const config = loadConfig();
    const result = uninstallSkill(skillName, target, {
      projectRoot: config.projectRoot,
      operationsPath: `${config.projectRoot}/registry/operations.jsonl`,
      mappingsPath: `${config.projectRoot}/registry/mappings.json`,
    });
    return { ...result, legacy: true } as unknown as Record<string, unknown>;
  },

  map: (body) => {
    const skillName = body.skillName as string;
    const target = body.target as string;
    if (!skillName || !target) return { error: 'Missing "skillName" or "target" field' };
    const config = loadConfig();
    const targetProfiles = listTargetProfiles(config.targets);
    return mapSkill(skillName, target, {
      projectRoot: config.projectRoot,
      mappingsPath: `${config.projectRoot}/registry/mappings.json`,
      targetProfiles,
      backupsRoot: `${config.projectRoot}/backups`,
    }) as unknown as Record<string, unknown>;
  },

  unmap: (body) => {
    const skillName = body.skillName as string;
    const target = body.target as string;
    if (!skillName || !target) return { error: 'Missing "skillName" or "target" field' };
    const config = loadConfig();
    const targetProfiles = listTargetProfiles(config.targets);
    return unmapSkill(skillName, target, {
      projectRoot: config.projectRoot,
      mappingsPath: `${config.projectRoot}/registry/mappings.json`,
      targetProfiles,
    }) as unknown as Record<string, unknown>;
  },

  adopt: (body) => {
    const skillName = body.skillName as string;
    const target = body.target as string;
    if (!skillName || !target) return { error: 'Missing "skillName" or "target" field' };
    const config = loadConfig();
    const targetProfiles = listTargetProfiles(config.targets);
    return adoptSkill(skillName, target, {
      projectRoot: config.projectRoot,
      mappingsPath: `${config.projectRoot}/registry/mappings.json`,
      targetProfiles,
      backupsRoot: `${config.projectRoot}/backups`,
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
    const config = loadConfig();
    const compatResult = checkCompatibility(skillPath, target, {
      targetProfiles: listTargetProfiles(config.targets),
      mappingsPath: `${config.projectRoot}/registry/mappings.json`,
    });
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
      operationsPath: `${config.projectRoot}/registry/operations.jsonl`,
      mappingsPath: `${config.projectRoot}/registry/mappings.json`,
    }) as unknown as Record<string, unknown>;
  },

  discover: () => {
    const config = loadConfig();
    const registryPath = `${config.projectRoot}/registry/skills.json`;
    const inventory = discoverSkillInventory({
      projectRoot: config.projectRoot,
      registryPath,
      mappingsPath: `${config.projectRoot}/registry/mappings.json`,
      targets: config.targets,
    });
    const descriptionRegistry = readDescriptionRegistry(config.projectRoot);
    return {
      ...inventory,
      skills: withDisplayDescriptions(inventory.skills, descriptionRegistry),
      targetProfiles: listTargetProfiles(config.targets),
    } as unknown as Record<string, unknown>;
  },

  'compat/batch': (body) => {
    const skillNames = body.skillNames as string[];
    const target = body.target as string;
    if (!skillNames?.length || !target) return { error: 'Missing "skillNames" or "target" field' };
    const config = loadConfig();
    const inventory = discoverSkillInventory({
      projectRoot: config.projectRoot,
      mappingsPath: `${config.projectRoot}/registry/mappings.json`,
      targets: config.targets,
    });
    const skillMap = new Map(inventory.skills.map((s) => [s.name, s]));
    const results: Array<{ name: string; status: string; error?: string }> = [];
    for (const name of skillNames) {
      const skill = skillMap.get(name);
      if (!skill) {
        results.push({ name, status: 'error', error: `Skill "${name}" not found` });
        continue;
      }
      try {
        const result = checkCompatibility(skill.path, target, {
          targetProfiles: listTargetProfiles(config.targets),
          mappingsPath: `${config.projectRoot}/registry/mappings.json`,
        });
        results.push({ name, status: result.status as string });
      } catch (err) {
        results.push({ name, status: 'error', error: (err as Error).message });
      }
    }
    const summary = {
      total: results.length,
      compatible: results.filter((r) => r.status === 'compatible').length,
      needsOverlay: results.filter((r) => r.status === 'needs-overlay').length,
      unsupported: results.filter((r) => r.status === 'unsupported').length,
      unknown: results.filter((r) => r.status === 'unknown').length,
      errors: results.filter((r) => r.status === 'error').length,
    };
    return { summary, results } as unknown as Record<string, unknown>;
  },

  'install/batch': (body) => {
    const skillNames = body.skillNames as string[];
    const target = body.target as string;
    if (!skillNames?.length || !target) return { error: 'Missing "skillNames" or "target" field' };
    const config = loadConfig();
    const targetProfiles = listTargetProfiles(config.targets);
    const results: Array<{ name: string; status: string; error?: string }> = [];
    for (const name of skillNames) {
      try {
        const result = installSkill(name, target, config.defaultLinkMode, {
          projectRoot: config.projectRoot,
          operationsPath: `${config.projectRoot}/registry/operations.jsonl`,
          mappingsPath: `${config.projectRoot}/registry/mappings.json`,
          targetProfiles,
        });
        results.push({ name, status: result.status as string });
      } catch (err) {
        results.push({ name, status: 'error', error: (err as Error).message });
      }
    }
    return { total: results.length, results, legacy: true } as unknown as Record<string, unknown>;
  },

  'uninstall/batch': (body) => {
    const skillNames = body.skillNames as string[];
    const target = body.target as string;
    if (!skillNames?.length || !target) return { error: 'Missing "skillNames" or "target" field' };
    const config = loadConfig();
    const results: Array<{ name: string; status: string; error?: string }> = [];
    for (const name of skillNames) {
      try {
        const result = uninstallSkill(name, target, {
          projectRoot: config.projectRoot,
          operationsPath: `${config.projectRoot}/registry/operations.jsonl`,
          mappingsPath: `${config.projectRoot}/registry/mappings.json`,
        });
        results.push({ name, status: result.status as string });
      } catch (err) {
        results.push({ name, status: 'error', error: (err as Error).message });
      }
    }
    return { total: results.length, results, legacy: true } as unknown as Record<string, unknown>;
  },

  'map/batch': (body) => {
    const skillNames = body.skillNames as string[];
    const target = body.target as string;
    if (!skillNames?.length || !target) return { error: 'Missing "skillNames" or "target" field' };
    const config = loadConfig();
    const targetProfiles = listTargetProfiles(config.targets);
    const results: Array<{ name: string; status: string; message?: string }> = [];
    for (const name of skillNames) {
      try {
        const result = mapSkill(name, target, {
          projectRoot: config.projectRoot,
          mappingsPath: `${config.projectRoot}/registry/mappings.json`,
          targetProfiles,
          backupsRoot: `${config.projectRoot}/backups`,
        });
        results.push({ name, status: result.status, message: result.message });
      } catch (err) {
        results.push({ name, status: 'error', message: (err as Error).message });
      }
    }
    const summary = {
      total: results.length,
      mapped: results.filter((r) => r.status === 'mapped').length,
      alreadyMapped: results.filter((r) => r.status === 'already-mapped').length,
      notFound: results.filter((r) => r.status === 'not-found').length,
      blocked: results.filter((r) => r.status === 'blocked').length,
      errors: results.filter((r) => r.status === 'error').length,
    };
    return { summary, results } as unknown as Record<string, unknown>;
  },

  'unmap/batch': (body) => {
    const skillNames = body.skillNames as string[];
    const target = body.target as string;
    if (!skillNames?.length || !target) return { error: 'Missing "skillNames" or "target" field' };
    const config = loadConfig();
    const targetProfiles = listTargetProfiles(config.targets);
    const results: Array<{ name: string; status: string; message?: string }> = [];
    for (const name of skillNames) {
      try {
        const result = unmapSkill(name, target, {
          projectRoot: config.projectRoot,
          mappingsPath: `${config.projectRoot}/registry/mappings.json`,
          targetProfiles,
        });
        results.push({ name, status: result.status, message: result.message });
      } catch (err) {
        results.push({ name, status: 'error', message: (err as Error).message });
      }
    }
    const summary = {
      total: results.length,
      unmapped: results.filter((r) => r.status === 'unmapped').length,
      notFound: results.filter((r) => r.status === 'not-found').length,
      refused: results.filter((r) => r.status === 'refused').length,
      errors: results.filter((r) => r.status === 'error').length,
    };
    return { summary, results } as unknown as Record<string, unknown>;
  },

  'adopt/batch': (body) => {
    const skillNames = body.skillNames as string[];
    const target = body.target as string;
    if (!skillNames?.length || !target) return { error: 'Missing "skillNames" or "target" field' };
    const config = loadConfig();
    const targetProfiles = listTargetProfiles(config.targets);
    const results: Array<{ name: string; status: string; message?: string }> = [];
    for (const name of skillNames) {
      try {
        const result = adoptSkill(name, target, {
          projectRoot: config.projectRoot,
          mappingsPath: `${config.projectRoot}/registry/mappings.json`,
          targetProfiles,
          backupsRoot: `${config.projectRoot}/backups`,
        });
        results.push({ name, status: result.status, message: result.message });
      } catch (err) {
        results.push({ name, status: 'error', message: (err as Error).message });
      }
    }
    const summary = {
      total: results.length,
      adopted: results.filter((r) => r.status === 'adopted').length,
      alreadyLinked: results.filter((r) => r.status === 'already-linked').length,
      notFound: results.filter((r) => r.status === 'not-found').length,
      blocked: results.filter((r) => r.status === 'blocked').length,
      errors: results.filter((r) => r.status === 'error').length,
    };
    return { summary, results } as unknown as Record<string, unknown>;
  },

  'discover/import': () => {
    const config = loadConfig();
    const registryPath = `${config.projectRoot}/registry/skills.json`;
    const incoming = `${config.projectRoot}/incoming`;
    const skills = `${config.projectRoot}/skills`;
    const discovered = discoverSkills({
      projectRoot: config.projectRoot,
      registryPath,
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

    // Serve SPA index.html for all non-API GET requests (supports client-side routing)
    if (req.method === 'GET' && !path.startsWith('/api/')) {
      // Try to serve static file from SPA build
      if (spaIndexHtml && path !== '/') {
        const filePath = join(SPA_ROOT, path);
        try {
          const content = readFileSync(filePath);
          const ext = path.split('.').pop() || '';
          const mimeTypes: Record<string, string> = {
            js: 'application/javascript',
            css: 'text/css',
            svg: 'image/svg+xml',
            png: 'image/png',
            json: 'application/json',
            woff2: 'font/woff2',
          };
          res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
          res.end(content);
          return;
        } catch {
          // Not a static file — serve SPA index.html for client-side routing
        }
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(spaIndexHtml || renderControlPanelPage({ version: VERSION }));
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
        sendJson(res, 404, { error: `Unknown API: ${route}` });
        return;
      }
      const body = req.method === 'GET' ? {} : await parseBody(req);
      try {
        const result = await handler(body);
        sendJson(res, 200, result);
      } catch (err) {
        sendJson(res, 500, { error: (err as Error).message });
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
