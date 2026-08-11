import { describe, expect, it } from "vitest";
import { shouldSyncLocaleToServer } from "@/lib/i18n/localeSource";

describe("shouldSyncLocaleToServer", () => {
  it("does not persist a locale selected only by a localized URL", () => {
    expect(shouldSyncLocaleToServer("path")).toBe(false);
  });

  it("waits until the client preference source has been resolved", () => {
    expect(shouldSyncLocaleToServer("initial")).toBe(false);
  });

  it.each(["stored", "browser", "default", "user"] as const)(
    "keeps the existing sync behavior for %s locale selection",
    (source) => {
      expect(shouldSyncLocaleToServer(source)).toBe(true);
    },
  );
});
