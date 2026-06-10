// Safe identifier helpers for SkillGov skill names and target ids used as filesystem path segments.
export const SAFE_FILE_NAME_PATTERN = /^[a-z0-9][a-z0-9_-]*$/;

export function isSafeFileName(value: string): boolean {
  return SAFE_FILE_NAME_PATTERN.test(value);
}

export function assertSafeFileName(value: string, label: string): void {
  if (!isSafeFileName(value)) {
    throw new Error(
      `${label} must be a safe file name using lowercase letters, numbers, dashes, and underscores.`,
    );
  }
}
