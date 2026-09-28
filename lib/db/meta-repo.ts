import { getDb } from "@/lib/db/db";
import type { Floor, Project } from "@/lib/domain/schema";

// PRD 28: settings and misc state live in the meta table. lib/db is the only
// module that knows IndexedDB exists.

export type ThemeSetting = "light" | "dark" | "system";

export const DEFAULT_STEP_LENGTH_M = 0.75;

export const metaRepo = {
  async get<T>(key: string): Promise<T | undefined> {
    const entry = await getDb().meta.get(key);
    return entry?.value as T | undefined;
  },

  async set<T>(key: string, value: T): Promise<void> {
    await getDb().meta.put({ key, value });
  },

  async remove(key: string): Promise<void> {
    await getDb().meta.delete(key);
  },

  async getStepLengthM(): Promise<number> {
    const v = await this.get<number>("stepLengthM");
    return typeof v === "number" && v > 0 ? v : DEFAULT_STEP_LENGTH_M;
  },

  async setStepLengthM(m: number): Promise<void> {
    await this.set("stepLengthM", m);
  },

  async getTheme(): Promise<ThemeSetting> {
    const v = await this.get<ThemeSetting>("theme");
    return v === "light" || v === "dark" || v === "system" ? v : "system";
  },

  async setTheme(theme: ThemeSetting): Promise<void> {
    await this.set("theme", theme);
  },

  // PRD 30: the backup reminder compares now with the project's last backup.
  async getLastBackupAt(projectId: string): Promise<number | undefined> {
    return this.get<number>(`backup:${projectId}`);
  },

  async setLastBackupAt(projectId: string, at: number): Promise<void> {
    await this.set(`backup:${projectId}`, at);
  },

  async dismissBackupReminder(projectId: string): Promise<void> {
    await this.set(`backupDismissed:${projectId}`, Date.now());
  },

  async isBackupReminderDismissed(projectId: string): Promise<boolean> {
    const v = await this.get<number>(`backupDismissed:${projectId}`);
    return typeof v === "number";
  },

  async setPersistenceGranted(granted: boolean): Promise<void> {
    await this.set("persistGranted", granted);
  },

  async isPersistenceGranted(): Promise<boolean> {
    const v = await this.get<boolean>("persistGranted");
    return v === true;
  },
};

// PRD 30: a project older than 7 days since its last backup shows the
// non-blocking reminder banner. Dismissal silences it for the session.
export const BACKUP_REMINDER_MS = 7 * 24 * 60 * 60 * 1000;
// PRD 29: persistence denied -> remind twice as often.
export const BACKUP_REMINDER_DENIED_MS = 3 * 24 * 60 * 60 * 1000;

export function shouldRemindBackup(
  project: Project,
  lastBackupAt: number | undefined,
  dismissed: boolean,
  now = Date.now(),
  thresholdMs: number = BACKUP_REMINDER_MS,
): boolean {
  if (dismissed) return false;
  const reference = lastBackupAt ?? project.createdAt;
  return now - reference > thresholdMs;
}

// PRD 11: "2 mapped" counts floors that have at least one feature; floors
// carry status separately, so mapped-ness is derived from the features.
export function countMappedFloors(floors: Floor[], featureFloorIds: Set<string>): number {
  return floors.filter((f) => featureFloorIds.has(f.id)).length;
}
