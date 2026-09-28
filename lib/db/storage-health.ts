// PRD 29 storage health + PRD 32 error dignity: quota and persistence are
// first-class, non-blocking, and every failure maps to a plain-language
// message with one next action.

export interface StorageUsage {
  usage: number;
  quota: number;
  ratio: number;
}

// PRD 29: warn above 80% usage. Null when the API is unavailable (private
// mode, unsupported browser) - never a hard failure.
export async function storageUsage(): Promise<StorageUsage | null> {
  if (typeof navigator === "undefined" || !navigator.storage?.estimate) {
    return null;
  }
  try {
    const { usage = 0, quota = 0 } = await navigator.storage.estimate();
    if (!quota) return null;
    return { usage, quota, ratio: usage / quota };
  } catch {
    return null;
  }
}

export const STORAGE_WARN_RATIO = 0.8;

export function shouldWarnStorage(usage: StorageUsage | null): boolean {
  return usage !== null && usage.ratio >= STORAGE_WARN_RATIO;
}

// PRD 29: requested on first mapping session start; denial just means we
// surface the backup reminder more often. Never blocking.
export async function requestPersistentStorage(): Promise<boolean> {
  if (typeof navigator === "undefined" || !navigator.storage?.persist) {
    return false;
  }
  try {
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

export interface StorageErrorInfo {
  title: string;
  action: string;
}

// PRD 32: quota, private-mode eviction and corruption each get a specific
// message and a backup-import recovery path.
export function describeStorageError(error: unknown): StorageErrorInfo {
  const name = error instanceof Error ? error.name : String(error);
  switch (name) {
    case "QuotaExceededError":
      return {
        title: "Your device's storage is full.",
        action: "Free up space, then download a backup to keep your maps safe.",
      };
    case "DatabaseClosedError":
    case "VersionError":
    case "OpenFailedError":
      return {
        title: "The map database could not be opened.",
        action: "Import your latest backup file to recover your projects.",
      };
    case "NotFoundError":
      return {
        title: "A saved map could not be found.",
        action: "Reopen the workspace; if it persists, restore from a backup.",
      };
    default:
      return {
        title: "Something went wrong while saving.",
        action: "Try again - your last completed action is safe.",
      };
  }
}
