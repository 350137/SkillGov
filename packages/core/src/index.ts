// Re-exports the public API surface of @skillgov/core — config, targets, registry, operations, init, frontmatter, validator, hash, import, compat, task, installer, status, and doctor modules.
export { VERSION, version } from './version.js';
export { defaultConfig, loadConfig, writeConfig, normalizePath } from './config.js';
export type { SkillGovConfig } from './config.js';
export { getTargetProfile, listTargetProfiles } from './targets.js';
export type { CapabilitySupport, TargetEntry, TargetProfile, TargetSupports } from './targets.js';
export { readRegistry, writeRegistry, addSkillEntry, RegistryCorruptedError } from './registry.js';
export type {
  SkillEntry,
  SkillsRegistry,
  CompatibilityEntry,
  CompatibilityRegistry,
  InstallRecord,
  InstallsRegistry,
  SkillMapping,
  SkillMappingLink,
  SkillMappingTarget,
  SkillMappingsRegistry,
} from './registry.js';
export { appendOperation, readOperations } from './operations.js';
export type { Operation, OperationInput } from './operations.js';
export { initProject } from './init.js';
export type { InitOptions } from './init.js';
export { parseFrontmatter } from './frontmatter.js';
export type { FrontmatterResult } from './frontmatter.js';
export { validateSkill } from './validator.js';
export type { ValidationResult, ValidationIssue } from './validator.js';
export { hashFile, hashDirectory } from './hash.js';
export { importSkill } from './import.js';
export type { ImportOptions, ImportResult } from './import.js';
export { checkCompatibility } from './compat.js';
export type { CompatibilityStatus, CompatibilityIssue, CompatibilityResult } from './compat.js';
export { generateRepairTask, generateOverlayTask } from './tasks.js';
export type { RepairTaskOptions, OverlayTaskOptions, TaskResult } from './tasks.js';
export { installSkill, uninstallSkill, rollbackLastInstall } from './installer.js';
export type { LinkMode, InstallOptions, InstallResult } from './installer.js';
export {
  adoptSkill,
  copyDir,
  createLink,
  detectLinkType,
  getMappingTargets,
  linkManagedSkillToAgent,
  mapSkill,
  migrateInstallsToMappings,
  readSkillMappings,
  removeMappingLink,
  unmapSkill,
  upsertMapping,
} from './mapping.js';
export type {
  AdoptSkillOptions,
  AdoptSkillResult,
  LinkDetectionResult,
  LinkManagedSkillOptions,
  LinkManagedSkillResult,
  LinkType,
  MapSkillOptions,
  MapSkillResult,
  MigrationResult,
  UnmapSkillOptions,
  UnmapSkillResult,
} from './mapping.js';
export { getProjectStatus } from './status.js';
export type { ProjectStatus, SkillStatus } from './status.js';
export { runDoctor } from './doctor.js';
export type { DoctorIssue, DoctorReport } from './doctor.js';
export { discoverSkillInventory, discoverSkills } from './discovery.js';
export type {
  DiscoveredSkill,
  DiscoveryOptions,
  NonSkillDirectory,
  SkillInventory,
} from './discovery.js';
