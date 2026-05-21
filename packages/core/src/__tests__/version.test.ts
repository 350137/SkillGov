// Tests for the version module — verifies the version string format and value.
import { describe, expect, it } from 'vitest';
import { VERSION, version } from '../version.js';

describe('version', () => {
  it('returns a semver-like string', () => {
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('matches the version() helper output', () => {
    expect(version()).toBe(VERSION);
  });
});
