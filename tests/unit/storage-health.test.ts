import { describe, expect, it } from "vitest";
import { describeStorageError, shouldWarnStorage } from "@/lib/db/storage-health";

describe("describeStorageError (PRD 32 error dignity)", () => {
  it("names quota errors with a concrete next action", () => {
    const info = describeStorageError(
      Object.assign(new Error("full"), { name: "QuotaExceededError" }),
    );
    expect(info.title).toMatch(/storage is full/i);
    expect(info.action).toMatch(/backup/i);
  });

  it("names corruption-style open failures with the backup recovery path", () => {
    const info = describeStorageError(
      Object.assign(new Error("x"), { name: "DatabaseClosedError" }),
    );
    expect(info.action).toMatch(/import/i);
  });

  it("has a safe fallback that never dead-ends", () => {
    const info = describeStorageError("weird");
    expect(info.title).toBeTruthy();
    expect(info.action).toBeTruthy();
  });
});

describe("shouldWarnStorage (PRD 29)", () => {
  it("warns at or above 80 percent usage", () => {
    expect(shouldWarnStorage({ usage: 81, quota: 100, ratio: 0.81 })).toBe(true);
    expect(shouldWarnStorage({ usage: 80, quota: 100, ratio: 0.8 })).toBe(true);
    expect(shouldWarnStorage({ usage: 10, quota: 100, ratio: 0.1 })).toBe(false);
  });

  it("never warns when usage is unknown", () => {
    expect(shouldWarnStorage(null)).toBe(false);
  });
});
