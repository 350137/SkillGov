// Tests for the core public API — verifies all named exports are present and functional.
import { describe, expect, it } from 'vitest';
import { VERSION, version } from '../index.js';

describe('@skillgov/core public API', () => {
  it('exports VERSION as a non-empty string', () => {
    expect(typeof VERSION).toBe('string');
    expect(VERSION.length).toBeGreaterThan(0);
  });

  it('exports version() returning the same value', () => {
    expect(version()).toBe(VERSION);
  });
});
