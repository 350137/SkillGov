// Re-exports the public API surface of @skillgov/core — config, targets, registry, operations, and init modules.
export { VERSION, version } from './version.js';
export { defaultConfig, loadConfig, writeConfig, normalizePath } from './config.js';
export type { SkillGovConfig } from './config.js';
export { getTargetProfile } from './targets.js';
export type { TargetProfile, TargetSupports } from './targets.js';
export { readRegistry, writeRegistry, addSkillEntry } from './registry.js';
export type {
  SkillEntry,
  SkillsRegistry,
  CompatibilityEntry,
  CompatibilityRegistry,
  InstallRecord,
  InstallsRegistry,
} from './registry.js';
export { appendOperation, readOperations } from './operations.js';
export type { Operation, OperationInput } from './operations.js';
export { initProject } from './init.js';
export type { InitOptions } from './init.js';
