// Remote skill intake helpers validate search input, remote IDs, downloaded payloads, and staging paths.
import { isAbsolute, relative, resolve } from 'node:path';

export interface RemoteSkillResult {
  id: string;
  skillId: string;
  name: string;
  source: string;
  installs?: number;
  installed?: boolean;
  validationStatus?: string;
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
