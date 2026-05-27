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
      'discover',
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

  it('compat prints usage when missing --target', () => {
    const { stdout, exitCode } = captureOutput(['compat', 'some-skill']);
    expect(stdout).toContain('Usage: skillgov compat');
    expect(exitCode).toBe(1);
  });

  it('compat prints usage when missing skill', () => {
    const { stdout, exitCode } = captureOutput(['compat']);
    expect(stdout).toContain('Usage: skillgov compat');
    expect(exitCode).toBe(1);
  });

  it('task repair prints usage when missing skill', () => {
    const { stdout, exitCode } = captureOutput(['task', 'repair']);
    expect(stdout).toContain('Usage: skillgov task repair');
    expect(exitCode).toBe(1);
  });

  it('task overlay prints usage when missing --target', () => {
    const { stdout, exitCode } = captureOutput(['task', 'overlay', 'some-skill']);
    expect(stdout).toContain('Usage: skillgov task overlay');
    expect(exitCode).toBe(1);
  });

  it('task with unknown subcommand prints usage', () => {
    const { stdout, exitCode } = captureOutput(['task', 'bogus']);
    expect(stdout).toContain('Usage: skillgov task repair');
    expect(exitCode).toBe(1);
  });

  it('install prints usage when missing --target', () => {
    const { stdout, exitCode } = captureOutput(['install', 'some-skill']);
    expect(stdout).toContain('Usage: skillgov install');
    expect(exitCode).toBe(1);
  });

  it('uninstall prints usage when missing --target', () => {
    const { stdout, exitCode } = captureOutput(['uninstall', 'some-skill']);
    expect(stdout).toContain('Usage: skillgov uninstall');
    expect(exitCode).toBe(1);
  });

  it('rollback prints usage when missing target and id', () => {
    const { stdout, exitCode } = captureOutput(['rollback']);
    expect(stdout).toContain('Usage: skillgov rollback');
    expect(exitCode).toBe(1);
  });

  it('discover runs without error', () => {
    const { stdout } = captureOutput(['discover']);
    expect(stdout).toMatch(/Found \d+ local skill|No local skills found/);
  });
});
