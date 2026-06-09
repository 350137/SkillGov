// Shared TypeScript types for the control panel React SPA — skill, target, and API response shapes.
export interface AgentState {
  profileId: string;
  profileLabel: string;
  state: string;
  path: string;
}

export interface MappingSummary {
  total: number;
  linked: number;
  missing: number;
  conflict: number;
}

export interface DisplayDescription {
  zh?: string;
  en?: string;
  fallback?: string;
  resolvedZh?: string;
  resolvedEn?: string;
  reviewStatus?: string;
  source?: string;
}

export interface Skill {
  name: string;
  path?: string;
  source?: string;
  sourceLabel?: string;
  validationStatus?: string;
  agentStates?: AgentState[];
  mappingSummary?: MappingSummary;
  displayDescription?: DisplayDescription;
}

export interface TargetProfile {
  id: string;
  label: string;
  skillDirs?: string[];
  linkMode?: string;
}

export interface StatusResponse {
  app: string;
  apiVersion: string;
  projectRoot: string;
  skills: Skill[];
  installs: unknown[];
  nonSkillDirectories: string[];
  targetProfiles: TargetProfile[];
}

export interface DiscoverResponse {
  skills: Skill[];
  nonSkillDirectories: string[];
  targetProfiles: TargetProfile[];
}

export interface CompatResult {
  status: string;
  reason?: string;
  suggestedAction?: string;
  issues?: Array<{ severity: string; message: string }>;
}

export interface BatchResult {
  summary?: Record<string, number>;
  total?: number;
  results: Array<{ name: string; status: string; message?: string; error?: string }>;
}

export interface SingleResult {
  status: string;
  message?: string;
  legacy?: boolean;
}

export interface DoctorResult {
  issues: Array<{ severity: string; message: string }>;
}

export type Language = 'en' | 'zh';
