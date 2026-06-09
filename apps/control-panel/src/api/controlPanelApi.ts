// API client for the SkillGov control panel — wraps fetch calls to /api/* endpoints.
import type {
  BatchResult,
  CompatResult,
  DiscoverResponse,
  DoctorResult,
  SingleResult,
  StatusResponse,
} from '../types';

async function post<T>(endpoint: string, body?: Record<string, unknown>): Promise<T> {
  const res = await fetch(`/api/${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });
  return res.json();
}

export const api = {
  getStatus: () => post<StatusResponse>('status'),
  getTargets: () => post<{ targets: StatusResponse['targetProfiles'] }>('targets'),
  discover: () => post<DiscoverResponse>('discover'),
  discoverImport: () =>
    post<{ total: number; imported: number; results: Array<{ name: string; status: string }> }>(
      'discover/import',
    ),

  compat: (skillPath: string, target: string) =>
    post<CompatResult>('compat', { skillPath, target }),
  compatBatch: (skillNames: string[], target: string) =>
    post<BatchResult>('compat/batch', { skillNames, target }),

  map: (skillName: string, target: string) => post<SingleResult>('map', { skillName, target }),
  unmap: (skillName: string, target: string) => post<SingleResult>('unmap', { skillName, target }),
  adopt: (skillName: string, target: string) => post<SingleResult>('adopt', { skillName, target }),

  mapBatch: (skillNames: string[], target: string) =>
    post<BatchResult>('map/batch', { skillNames, target }),
  unmapBatch: (skillNames: string[], target: string) =>
    post<BatchResult>('unmap/batch', { skillNames, target }),
  adoptBatch: (skillNames: string[], target: string) =>
    post<BatchResult>('adopt/batch', { skillNames, target }),

  doctor: () => post<DoctorResult>('doctor'),
  rollback: (target: string) => post<SingleResult>('rollback', { target }),
};
