import { describe, expect, it } from "vitest";
import { backupFilename, projectSlug } from "@/lib/backup/filename";
import { relativeTime } from "@/lib/utils/relative-time";
import { shouldRemindBackup } from "@/lib/db/meta-repo";
import type { Project } from "@/lib/domain/schema";
import { HISTORY_LIMIT, useHistoryStore } from "@/lib/store/history";

// Small pure units supporting Phase 2 screens (PRD 9/30).

describe("projectSlug / backupFilename (PRD 30)", () => {
  it("slugs building names for file systems", () => {
    expect(projectSlug("ABC Shopping Mall")).toBe("ABC-Shopping-Mall");
    expect(projectSlug("  weird /name!! ")).toBe("weird-name");
    expect(projectSlug("___")).toBe("project");
  });

  it("builds the dated backup filename", () => {
    const name = backupFilename("ABC Shopping Mall", new Date(2026, 8, 28));
    expect(name).toBe("ABC-Shopping-Mall-backup-2026-09-28.walkandplot.json");
  });
});

describe("relativeTime (PRD 9: 'Edited 2 hours ago')", () => {
  const now = Date.parse("2026-09-28T12:00:00Z");
  it("covers the human ranges", () => {
    expect(relativeTime(now - 10_000, now)).toBe("just now");
    expect(relativeTime(now - 3 * 60_000, now)).toBe("3 minutes ago");
    expect(relativeTime(now - 60 * 60_000, now)).toBe("1 hour ago");
    expect(relativeTime(now - 5 * 3_600_000, now)).toBe("5 hours ago");
    expect(relativeTime(now - 24 * 3_600_000, now)).toBe("yesterday");
    expect(relativeTime(now - 3 * 86_400_000, now)).toBe("3 days ago");
    expect(relativeTime(now - 8 * 86_400_000, now)).toBe("last week");
    expect(relativeTime(now - 20 * 86_400_000, now)).toBe("2 weeks ago");
    expect(relativeTime(now - 40 * 86_400_000, now)).toBe("over a month ago");
  });
});

describe("shouldRemindBackup (PRD 30: 7-day, dismissible)", () => {
  const now = Date.now();
  const project = {
    id: "p1",
    name: "Mall",
    status: "active" as const,
    createdAt: now - 10 * 86_400_000,
    updatedAt: now,
  } satisfies Project;

  it("reminds after 7 days without a backup", () => {
    expect(shouldRemindBackup(project, undefined, false, now)).toBe(true);
  });
  it("stays quiet for a recent backup", () => {
    expect(shouldRemindBackup(project, now - 2 * 86_400_000, false, now)).toBe(false);
  });
  it("respects dismissal", () => {
    expect(shouldRemindBackup(project, undefined, true, now)).toBe(false);
  });
});

describe("history store (PRD 17: session undo/redo, 100 steps)", () => {
  function reset() {
    useHistoryStore.setState({ past: [], future: [] });
  }

  it("undoes and redos in order", async () => {
    reset();
    const applied: string[] = [];
    const s = useHistoryStore.getState();
    s.push({
      label: "a",
      undo: async () => {
        applied.push("undo-a");
      },
      redo: async () => {
        applied.push("redo-a");
      },
    });
    useHistoryStore.getState().push({
      label: "b",
      undo: async () => {
        applied.push("undo-b");
      },
      redo: async () => {
        applied.push("redo-b");
      },
    });
    await useHistoryStore.getState().undo();
    await useHistoryStore.getState().undo();
    expect(applied).toEqual(["undo-b", "undo-a"]);
    await useHistoryStore.getState().redo();
    expect(applied).toEqual(["undo-b", "undo-a", "redo-a"]);
    expect(useHistoryStore.getState().past).toHaveLength(1);
  });

  it("pushing clears the redo stack", () => {
    reset();
    const noop = async () => {};
    const s = useHistoryStore.getState();
    s.push({ label: "a", undo: noop, redo: noop });
    void s;
    useHistoryStore.getState().undo();
    expect(useHistoryStore.getState().future).toHaveLength(1);
    useHistoryStore.getState().push({ label: "b", undo: noop, redo: noop });
    expect(useHistoryStore.getState().future).toHaveLength(0);
  });

  it("caps at 100 entries (PRD 17 minimum)", () => {
    reset();
    const noop = async () => {};
    for (let i = 0; i < HISTORY_LIMIT + 20; i++) {
      useHistoryStore.getState().push({ label: `e${i}`, undo: noop, redo: noop });
    }
    expect(useHistoryStore.getState().past).toHaveLength(HISTORY_LIMIT);
  });

  it("dropEntry removes without running (undo-toast reconciliation)", async () => {
    reset();
    let ran = false;
    const entry = {
      label: "del",
      undo: async () => {
        ran = true;
      },
      redo: async () => {},
    };
    useHistoryStore.getState().push(entry);
    useHistoryStore.getState().dropEntry(entry);
    expect(useHistoryStore.getState().past).toHaveLength(0);
    await useHistoryStore.getState().undo();
    expect(ran).toBe(false);
  });
});
