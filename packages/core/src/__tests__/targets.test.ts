import { homedir } from 'node:os';
// Tests for target profile definitions — resolves home directories and provides default agent profiles.
import { describe, expect, it } from 'vitest';
import { type TargetProfile, getTargetProfile } from '../targets.js';

describe('getTargetProfile', () => {
  it('returns claude profile with resolved home dir', () => {
    const profile = getTargetProfile('claude') as TargetProfile;
    expect(profile.skillDirs[0]).toContain(homedir().replace(/\\/g, '/'));
    expect(profile.skillDirs[0]).toMatch(/\/\.claude\/skills$/);
  });

  it('returns codex profile with resolved home dir', () => {
    const profile = getTargetProfile('codex') as TargetProfile;
    expect(profile.skillDirs[0]).toContain(homedir().replace(/\\/g, '/'));
    expect(profile.skillDirs[0]).toMatch(/\/\.codex\/skills$/);
  });

  it('returns null for unknown target', () => {
    expect(getTargetProfile('unknown')).toBeNull();
  });

  it('claude profile has junction linkMode and skillMd support', () => {
    const profile = getTargetProfile('claude') as TargetProfile;
    expect(profile.linkMode).toBe('junction');
    expect(profile.supports.skillMd).toBe(true);
  });
});
