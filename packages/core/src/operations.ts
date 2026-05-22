// Append-only JSONL operation log — records install, uninstall, and rollback actions for traceability and rollback support.
import { randomUUID } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export interface Operation {
  id: string;
  timestamp: string;
  action: string;
  skill: string;
  target?: string;
  status: 'started' | 'completed' | 'failed' | 'rolled-back';
  details?: Record<string, unknown>;
}

export type OperationInput = Omit<Operation, 'id' | 'timestamp'>;

function ensureDir(path: string): void {
  const dir = dirname(path);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

export function appendOperation(logPath: string, input: OperationInput): Operation {
  const op: Operation = {
    id: randomUUID(),
    timestamp: new Date().toISOString(),
    ...input,
  };

  ensureDir(logPath);
  appendFileSync(logPath, `${JSON.stringify(op)}\n`, 'utf-8');
  return op;
}

export function readOperations(logPath: string): Operation[] {
  if (!existsSync(logPath)) {
    return [];
  }

  const content = readFileSync(logPath, 'utf-8');
  if (!content.trim()) {
    return [];
  }

  const lines = content.trim().split('\n');
  const ops: Operation[] = [];

  for (const line of lines) {
    try {
      ops.push(JSON.parse(line) as Operation);
    } catch {
      // Skip malformed lines
    }
  }

  return ops;
}
