import { describe, expect, it } from "vitest";
import { isPersistentSwrCacheKey } from "@/lib/swrCacheProvider";

describe("isPersistentSwrCacheKey", () => {
  it.each([
    '@"challenges-page",null,"ko","active",0,',
    '$inf$@"challenges-page",null,"ko","active",0,',
    '@"challenges-mine-page","uid","active",0,',
    '@"crew-races","uid","active",0,',
  ])("does not persist race list cache: %s", (key) => {
    expect(isPersistentSwrCacheKey(key)).toBe(false);
  });

  it.each([
    '@"challenge",12,"uid",',
    '@"me","uid",',
    '@"workouts","uid",',
  ])("keeps other cache entries persistent: %s", (key) => {
    expect(isPersistentSwrCacheKey(key)).toBe(true);
  });
});
