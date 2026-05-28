// Tests for target profile resolution — Claude and Codex skill directories and supported features.
import { homedir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { type TargetProfile, getTargetProfile, listTargetProfiles } from '../targets.js';

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

  it('claude profile includes id and label', () => {
    const profile = getTargetProfile('claude') as TargetProfile;
    expect(profile.id).toBe('claude');
    expect(profile.label).toBe('Claude');
  });

  it('codex profile includes id and label', () => {
    const profile = getTargetProfile('codex') as TargetProfile;
    expect(profile.id).toBe('codex');
    expect(profile.label).toBe('Codex');
  });
});

describe('listTargetProfiles', () => {
  it('returns default Codex and Claude profiles when no args', () => {
    const profiles = listTargetProfiles();
    const ids = profiles.map((p) => p.id).sort();
    expect(ids).toEqual(['claude', 'codex']);
  });

  it('each default profile has id, label, skillDirs, linkMode', () => {
    const profiles = listTargetProfiles();
    for (const p of profiles) {
      expect(p).toHaveProperty('id');
      expect(p).toHaveProperty('label');
      expect(p).toHaveProperty('skillDirs');
      expect(p).toHaveProperty('linkMode');
      expect(Array.isArray(p.skillDirs)).toBe(true);
    }
  });

  it('accepts custom target objects and resolves them', () => {
    const profiles = listTargetProfiles([
      { id: 'opencode', label: 'OpenCode', skillDirs: ['D:/OpenCode/skills'] },
    ]);
    expect(profiles).toHaveLength(1);
    expect(profiles[0].id).toBe('opencode');
    expect(profiles[0].label).toBe('OpenCode');
    expect(profiles[0].skillDirs).toEqual(['D:/OpenCode/skills']);
  });

  it('getTargetProfile works with resolved custom profiles', () => {
    const profiles = listTargetProfiles([
      { id: 'opencode', label: 'OpenCode', skillDirs: ['D:/OpenCode/skills'] },
    ]);
    const profile = getTargetProfile('opencode', profiles);
    expect(profile).not.toBeNull();
    expect(profile?.label).toBe('OpenCode');
  });

  it('backward compatible: old string array targets still work', () => {
    const profiles = listTargetProfiles(['claude', 'codex']);
    const ids = profiles.map((p) => p.id).sort();
    expect(ids).toEqual(['claude', 'codex']);
  });

  it('mixed string and object targets work together', () => {
    const profiles = listTargetProfiles([
      'claude',
      { id: 'opencode', label: 'OpenCode', skillDirs: ['D:/OpenCode/skills'] },
    ]);
    const ids = profiles.map((p) => p.id).sort();
    expect(ids).toEqual(['claude', 'opencode']);
  });
});
