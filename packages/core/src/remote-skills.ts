// Remote skill intake helpers validate search input, remote IDs, downloaded payloads, and staging paths.
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { importSkill } from './import.js';
import { isSafeFileName } from './names.js';

export interface RemoteSkillResult {
  id: string;
  skillId: string;
  name: string;
  source: string;
  installs?: number;
  installed?: boolean;
  validationStatus?: string;
}

export interface RemoteSearchResponse {
  query: string;
  source: 'skills.sh';
  count: number;
  skills: RemoteSkillResult[];
}

export interface RemoteSkillPreview {
  id: string;
  name?: string;
  description?: string;
  fileCount: number;
  totalBytes: number;
  remoteHash?: string;
  status: 'pass' | 'fail';
  issues: string[];
}

export interface RemoteInstallResult {
  status: 'pass' | 'fixable' | 'fail';
  skillName?: string;
  issues: string[];
  message?: string;
  origin?: string;
}

export interface RemoteInstallOptions extends RemoteRequestOptions {
  projectRoot: string;
  incoming?: string;
  skills?: string;
  registryPath?: string;
}

export interface NormalizedRemoteQuery {
  query: string;
  limit: number;
}

export interface RemoteDownloadedFile {
  path: string;
  contents: string;
}

export interface RemoteDownloadedSkillPayload {
  files: RemoteDownloadedFile[];
  hash?: string;
}

export interface RemotePayloadValidation {
  status: 'pass' | 'fail';
  issues: string[];
  fileCount: number;
  totalBytes: number;
  skillMd?: string;
}

export interface RemoteInstalledSkill {
  name: string;
  validationStatus?: string;
}

export interface RemoteRequestOptions {
  fetch?: RemoteFetch;
  timeoutMs?: number;
}

export interface RemoteSearchOptions extends RemoteRequestOptions {
  limit?: number;
  installedSkills?: RemoteInstalledSkill[];
}

export type RemoteFetch = (
  url: string,
  init?: { signal?: AbortSignal },
) => Promise<RemoteFetchResponse>;

export interface RemoteFetchResponse {
  ok: boolean;
  status: number;
  statusText?: string;
  json: () => Promise<unknown>;
}

const SKILLS_API_BASE = 'https://skills.sh/api';
const MAX_QUERY_LENGTH = 100;
const DEFAULT_REMOTE_LIMIT = 20;
const MIN_REMOTE_LIMIT = 1;
const MAX_REMOTE_LIMIT = 50;
const MAX_REMOTE_FILES = 100;
const MAX_REMOTE_FILE_BYTES = 512 * 1024;
const MAX_REMOTE_TOTAL_BYTES = 2 * 1024 * 1024;
const REMOTE_ID_SEGMENT_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const WINDOWS_UNSAFE_FILE_CHARS = /[<>:"|?*]/;

export function normalizeRemoteQuery(
  query: string,
  limit = DEFAULT_REMOTE_LIMIT,
): NormalizedRemoteQuery {
  const normalized = query.trim();
  if (!normalized) {
    throw new Error('Remote search query is required.');
  }
  if (normalized.length > MAX_QUERY_LENGTH) {
    throw new Error(`Remote search query must be ${MAX_QUERY_LENGTH} characters or fewer.`);
  }

  const finiteLimit = Number.isFinite(limit) ? Math.trunc(limit) : DEFAULT_REMOTE_LIMIT;
  const clamped = Math.min(MAX_REMOTE_LIMIT, Math.max(MIN_REMOTE_LIMIT, finiteLimit));
  return { query: normalized, limit: clamped };
}

export function validateRemoteSkillId(remoteId: string): string {
  const normalized = remoteId.trim();
  const invalidMessage =
    'Remote skill ID must use safe path-like segments without traversal or absolute paths.';
  if (!normalized || normalized.length > 240) {
    throw new Error(invalidMessage);
  }
  if (
    normalized.includes('\\') ||
    normalized.startsWith('/') ||
    /^[A-Za-z]:[\\/]/.test(normalized)
  ) {
    throw new Error(invalidMessage);
  }

  const segments = normalized.split('/');
  if (segments.some((segment) => !REMOTE_ID_SEGMENT_PATTERN.test(segment))) {
    throw new Error(invalidMessage);
  }
  return normalized;
}

export function safeDownloadedFilePath(stagingDir: string, downloadedPath: string): string {
  const safePath = validateDownloadedPath(downloadedPath);
  const resolvedRoot = resolve(stagingDir);
  const resolvedFile = resolve(resolvedRoot, ...safePath.split('/'));
  const rel = relative(resolvedRoot, resolvedFile);

  if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) {
    throw new Error(`Unsafe downloaded file path: ${downloadedPath}`);
  }
  return resolvedFile;
}

export function validateDownloadedSkillPayload(payload: unknown): RemotePayloadValidation {
  const issues: string[] = [];
  let totalBytes = 0;
  let skillMd: string | undefined;

  if (!isDownloadedPayload(payload)) {
    return {
      status: 'fail',
      issues: ['Downloaded skill payload must include a files array.'],
      fileCount: 0,
      totalBytes: 0,
    };
  }

  if (payload.files.length > MAX_REMOTE_FILES) {
    issues.push(`Downloaded skill payload contains too many files; max is ${MAX_REMOTE_FILES}.`);
  }

  for (const file of payload.files) {
    try {
      validateDownloadedPath(file.path);
    } catch {
      issues.push(`Unsafe downloaded file path: ${file.path}`);
    }

    const byteLength = Buffer.byteLength(file.contents, 'utf8');
    totalBytes += byteLength;
    if (byteLength > MAX_REMOTE_FILE_BYTES) {
      issues.push(`Downloaded file is too large: ${file.path}`);
    }
    if (file.path === 'SKILL.md') {
      skillMd = file.contents;
    }
  }

  if (totalBytes > MAX_REMOTE_TOTAL_BYTES) {
    issues.push(`Downloaded skill payload is too large; max is ${MAX_REMOTE_TOTAL_BYTES} bytes.`);
  }
  if (!skillMd) {
    issues.push('Downloaded skill payload must include a root SKILL.md file.');
  }

  return {
    status: issues.length === 0 ? 'pass' : 'fail',
    issues,
    fileCount: payload.files.length,
    totalBytes,
    skillMd,
  };
}

export async function searchRemoteSkills(
  query: string,
  options: RemoteSearchOptions = {},
): Promise<RemoteSearchResponse> {
  const normalized = normalizeRemoteQuery(query, options.limit);
  const url = new URL(`${SKILLS_API_BASE}/search`);
  url.searchParams.set('q', normalized.query);
  url.searchParams.set('limit', String(normalized.limit));

  const raw = await requestRemoteJson(url.toString(), 'Remote skill search', options);
  if (!raw || typeof raw !== 'object' || !Array.isArray((raw as { skills?: unknown }).skills)) {
    throw new Error('Remote skill search returned an invalid response.');
  }

  const installedByName = new Map(
    (options.installedSkills || []).map((skill) => [skill.name, skill.validationStatus]),
  );
  const skills = (raw as { skills: unknown[] }).skills
    .map((item) => normalizeRemoteSearchItem(item, installedByName))
    .filter((item): item is RemoteSkillResult => item !== null);

  return {
    query: normalized.query,
    source: 'skills.sh',
    count: skills.length,
    skills,
  };
}

export async function previewRemoteSkill(
  remoteId: string,
  options: RemoteRequestOptions = {},
): Promise<RemoteSkillPreview> {
  const id = validateRemoteSkillId(remoteId);
  const raw = await requestRemoteJson(`${SKILLS_API_BASE}/download/${id}`, 'Remote skill preview', {
    ...options,
  });
  const validation = validateDownloadedSkillPayload(raw);
  const frontmatter = validation.skillMd ? parseSkillMdFrontmatter(validation.skillMd) : undefined;
  const issues = [...validation.issues, ...(frontmatter?.errors || [])];
  if (validation.status === 'pass' && !frontmatter?.data.name) {
    issues.push('Root SKILL.md frontmatter must include a name.');
  }
  if (validation.status === 'pass' && !frontmatter?.data.description) {
    issues.push('Root SKILL.md frontmatter must include a description.');
  }

  const remoteHash =
    raw && typeof raw === 'object' && typeof (raw as { hash?: unknown }).hash === 'string'
      ? (raw as { hash: string }).hash
      : undefined;

  return {
    id,
    name: frontmatter?.data.name,
    description: frontmatter?.data.description,
    fileCount: validation.fileCount,
    totalBytes: validation.totalBytes,
    remoteHash,
    status: issues.length === 0 ? 'pass' : 'fail',
    issues,
  };
}

export async function installRemoteSkill(
  remoteId: string,
  options: RemoteInstallOptions,
): Promise<RemoteInstallResult> {
  const id = validateRemoteSkillId(remoteId);
  const origin = `remote:skills.sh:${id}`;
  const projectRoot = resolve(options.projectRoot);
  const incomingDir = resolveProjectOwnedPath(
    projectRoot,
    options.incoming ?? join(projectRoot, 'incoming'),
    'Incoming directory',
  );
  const skillsDir = resolveProjectOwnedPath(
    projectRoot,
    options.skills ?? join(projectRoot, 'skills'),
    'Skills directory',
  );
  const registryPath = resolveProjectOwnedPath(
    projectRoot,
    options.registryPath ?? join(projectRoot, 'registry', 'skills.json'),
    'Skills registry path',
  );
  const raw = await requestRemoteJson(`${SKILLS_API_BASE}/download/${id}`, 'Remote skill install', {
    ...options,
  });
  const validation = validateDownloadedSkillPayload(raw);
  const frontmatter = validation.skillMd ? parseSkillMdFrontmatter(validation.skillMd) : undefined;
  const issues = [...validation.issues, ...(frontmatter?.errors || [])];
  const skillName = frontmatter?.data.name;

  if (validation.status === 'pass' && !skillName) {
    issues.push('Root SKILL.md frontmatter must include a name.');
  }
  if (skillName && !isSafeFileName(skillName)) {
    issues.push('Root SKILL.md frontmatter name must be a safe local skill name.');
  }
  if (validation.status === 'pass' && !frontmatter?.data.description) {
    issues.push('Root SKILL.md frontmatter must include a description.');
  }

  if (!isDownloadedPayload(raw) || issues.length > 0 || !skillName) {
    return { status: 'fail', skillName, issues, origin };
  }

  const remoteDownloadsDir = resolve(incomingDir, '.remote-downloads');
  const tempRoot = resolve(remoteDownloadsDir, safeRemoteStagingName(id));
  const sourceDir = resolve(tempRoot, skillName);
  const existed = existsSync(join(skillsDir, skillName));

  try {
    mkdirSync(sourceDir, { recursive: true });
    for (const file of raw.files) {
      const target = safeDownloadedFilePath(sourceDir, file.path);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, file.contents, 'utf-8');
    }

    const imported = importSkill(sourceDir, {
      incoming: incomingDir,
      skills: skillsDir,
      origin,
      registryPath,
    });

    return {
      status: imported.status,
      skillName: imported.skillName,
      issues: imported.issues,
      origin,
      message:
        imported.status === 'pass'
          ? existed
            ? `Replaced existing managed skill "${imported.skillName}".`
            : `Installed remote skill "${imported.skillName}".`
          : undefined,
    };
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
    removeDirIfEmpty(remoteDownloadsDir);
  }
}

function isDownloadedPayload(payload: unknown): payload is RemoteDownloadedSkillPayload {
  if (!payload || typeof payload !== 'object') return false;
  const files = (payload as { files?: unknown }).files;
  return (
    Array.isArray(files) &&
    files.every(
      (file) =>
        file &&
        typeof file === 'object' &&
        typeof (file as RemoteDownloadedFile).path === 'string' &&
        typeof (file as RemoteDownloadedFile).contents === 'string',
    )
  );
}

function normalizeRemoteSearchItem(
  item: unknown,
  installedByName: Map<string, string | undefined>,
): RemoteSkillResult | null {
  if (!item || typeof item !== 'object') return null;
  const raw = item as Record<string, unknown>;
  if (
    typeof raw.id !== 'string' ||
    typeof raw.skillId !== 'string' ||
    typeof raw.name !== 'string' ||
    typeof raw.source !== 'string'
  ) {
    return null;
  }

  let id: string;
  try {
    id = validateRemoteSkillId(raw.id);
  } catch {
    return null;
  }

  const validationStatus = installedByName.get(raw.name);
  return {
    id,
    skillId: raw.skillId,
    name: raw.name,
    source: raw.source,
    installs: typeof raw.installs === 'number' ? raw.installs : undefined,
    installed: installedByName.has(raw.name),
    validationStatus,
  };
}

async function requestRemoteJson(
  url: string,
  label: string,
  options: RemoteRequestOptions,
): Promise<unknown> {
  const fetchImpl = options.fetch || defaultRemoteFetch();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 10_000);

  try {
    const response = await fetchImpl(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`${label} failed with HTTP ${response.status} ${response.statusText || ''}`);
    }
    return response.json();
  } catch (error) {
    if ((error as Error).name === 'AbortError') {
      throw new Error(`${label} timed out.`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function defaultRemoteFetch(): RemoteFetch {
  if (typeof globalThis.fetch !== 'function') {
    throw new Error('Remote skill requests require fetch support.');
  }
  return globalThis.fetch as RemoteFetch;
}

function parseSkillMdFrontmatter(content: string): {
  data: Record<string, string>;
  errors: string[];
} {
  const data: Record<string, string> = {};
  const errors: string[] = [];

  if (!content.startsWith('---')) {
    return { data, errors: ['Root SKILL.md must start with frontmatter.'] };
  }

  const endIndex = content.indexOf('---', 3);
  if (endIndex === -1) {
    return { data, errors: ['Root SKILL.md frontmatter is not closed.'] };
  }

  const raw = content.slice(3, endIndex).trim();
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const colonIndex = trimmed.indexOf(':');
    if (colonIndex === -1) {
      errors.push(`Unparseable frontmatter line: "${trimmed}"`);
      continue;
    }
    const key = trimmed.slice(0, colonIndex).trim();
    const value = trimmed.slice(colonIndex + 1).trim();
    if (!key) {
      errors.push(`Unparseable frontmatter line: "${trimmed}"`);
      continue;
    }
    data[key] = stripQuotes(value);
  }

  return { data, errors };
}

function stripQuotes(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function safeRemoteStagingName(remoteId: string): string {
  return remoteId.replace(/[/.]/g, '_');
}

function resolveProjectOwnedPath(
  projectRoot: string,
  candidatePath: string,
  label: string,
): string {
  const resolved = resolve(candidatePath);
  const rel = relative(projectRoot, resolved);
  if (rel.startsWith('..') || isAbsolute(rel)) {
    throw new Error(`${label} must stay inside the project root.`);
  }
  return resolved;
}

function removeDirIfEmpty(dir: string): void {
  try {
    if (readdirSync(dir).length === 0) {
      rmSync(dir, { recursive: true, force: true });
    }
  } catch {
    // Directory may not exist if validation failed before staging.
  }
}

function validateDownloadedPath(downloadedPath: string): string {
  if (
    !downloadedPath ||
    downloadedPath.includes('\\') ||
    downloadedPath.startsWith('/') ||
    /^[A-Za-z]:[\\/]/.test(downloadedPath)
  ) {
    throw new Error(`Unsafe downloaded file path: ${downloadedPath}`);
  }

  const segments = downloadedPath.split('/');
  if (
    segments.some(
      (segment) =>
        !segment ||
        segment === '.' ||
        segment === '..' ||
        WINDOWS_UNSAFE_FILE_CHARS.test(segment) ||
        hasControlCharacter(segment),
    )
  ) {
    throw new Error(`Unsafe downloaded file path: ${downloadedPath}`);
  }
  return segments.join('/');
}

function hasControlCharacter(value: string): boolean {
  return [...value].some((char) => char.charCodeAt(0) <= 31);
}
