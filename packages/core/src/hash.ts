// File and directory hashing utilities — sync SHA-256 hash computation for integrity verification and drift detection.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

export function hashFile(filePath: string): string {
  if (!existsSync(filePath)) {
    throw new Error(`Cannot hash: file not found at "${filePath}"`);
  }
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

export function hashDirectory(dirPath: string): string {
  const hash = createHash('sha256');
  const entries = readdirSync(dirPath).sort();

  for (const entry of entries) {
    const full = resolve(dirPath, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) continue;
    hash.update(entry);
    hash.update(readFileSync(full));
  }

  return hash.digest('hex');
}
