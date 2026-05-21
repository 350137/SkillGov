// Root vitest configuration — uses projects to discover tests across all SkillGov packages.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: ['packages/core', 'packages/cli', 'apps/control-panel'],
  },
});
