// Desktop API adapter — calls Tauri Rust commands via invoke() instead of HTTP fetch.
import { invoke } from '@tauri-apps/api/core';
import type {
  BatchResult,
  CompatResult,
  DiscoverResponse,
  DoctorResult,
  SingleResult,
  StatusResponse,
  TargetProfile,
} from '../types';

export const desktopApi = {
  getStatus: () => invoke<StatusResponse>('get_status'),

  getTargets: () => invoke<TargetProfile[]>('list_targets').then((targets) => ({ targets })),

  discover: () => invoke<DiscoverResponse>('discover_skills'),

  discoverImport: () =>
    invoke<{ total: number; imported: number; results: unknown[] }>('discover_import'),

  compat: (skillPath: string, target: string) =>
    invoke<CompatResult>('check_compat', { skillPath, target }),

  compatBatch: (skillNames: string[], target: string) =>
    invoke<BatchResult>('compat_batch', { skillNames, target }),

  map: (skillName: string, target: string) =>
    invoke<SingleResult>('map_skill', { skillName, target }),

  unmap: (skillName: string, target: string) =>
    invoke<SingleResult>('unmap_skill', { skillName, target }),

  adopt: (skillName: string, target: string) =>
    invoke<SingleResult>('adopt_skill', { skillName, target }),

  mapBatch: (skillNames: string[], target: string) =>
    invoke<BatchResult>('map_batch', { skillNames, target }),

  unmapBatch: (skillNames: string[], target: string) =>
    invoke<BatchResult>('unmap_batch', { skillNames, target }),

  adoptBatch: (skillNames: string[], target: string) =>
    invoke<BatchResult>('adopt_batch', { skillNames, target }),

  doctor: () => invoke<DoctorResult>('run_doctor'),

  rollback: (target: string) => invoke<SingleResult>('rollback_install', { target }),
};
