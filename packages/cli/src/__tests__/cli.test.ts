// Tests for the CLI entry point — verifies help output, version, and unknown command behavior by calling main() directly.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { main } from '../index.js';

function captureOutput(args: string[]): { stdout: string; exitCode: number } {
  const lines: string[] = [];
  const spy = vi.spyOn(console, 'log').mockImplementation((...s: unknown[]) => {
    lines.push(s.map(String).join(' '));
  });

  process.exitCode = 0;

  try {
    main(args);
  } finally {
    spy.mockRestore();
  }

  return { stdout: lines.join('\n'), exitCode: process.exitCode ?? 0 };
}

beforeEach(() => {
  process.exitCode = 0;
});

describe('CLI main()', () => {
  it('prints help when called with no arguments', () => {
    const { stdout, exitCode } = captureOutput([]);
    expect(stdout).toContain('Usage: skillgov');
    expect(stdout).toContain('skillgov v0.1.0');
    expect(exitCode).toBe(0);
  });

  it('prints help when called with --help', () => {
    const { stdout, exitCode } = captureOutput(['--help']);
    expect(stdout).toContain('Usage: skillgov');
    expect(exitCode).toBe(0);
  });

  it('prints help when called with -h', () => {
    const { stdout, exitCode } = captureOutput(['-h']);
    expect(stdout).toContain('Usage: skillgov');
    expect(exitCode).toBe(0);
  });

  it('prints version when called with --version', () => {
    const { stdout, exitCode } = captureOutput(['--version']);
    expect(stdout).toContain('skillgov v0.1.0');
    expect(exitCode).toBe(0);
  });

  it('prints version when called with -v', () => {
    const { stdout, exitCode } = captureOutput(['-v']);
    expect(stdout).toContain('skillgov v0.1.0');
    expect(exitCode).toBe(0);
  });

  it('prints unknown command error for bogus input', () => {
    const { stdout, exitCode } = captureOutput(['bogus']);
    expect(stdout).toContain('Unknown command: bogus');
    expect(stdout).toContain('skillgov help');
    expect(exitCode).toBe(1);
  });

  it('help text lists all planned subcommands', () => {
    const { stdout } = captureOutput([]);
    const commands = [
      'init',
      'inventory',
      'import',
      'validate',
      'compat',
      'task repair',
      'task overlay',
      'install',
      'uninstall',
      'status',
      'doctor',
      'rollback',
    ];
    for (const cmd of commands) {
      expect(stdout).toContain(cmd);
    }
  });
});
