import { describe, expect, it } from "vitest";
import { selectChallengeDetailForRender } from "@/lib/challengeDetailState";

describe("selectChallengeDetailForRender", () => {
  it("hides stale detail immediately when the current fetch returns 404", () => {
    expect(selectChallengeDetailForRender(7, null, true, { id: 7 })).toEqual({
      notFound: true,
      detail: undefined,
    });
  });

  it("keeps the not-found screen after SWR clears the fetch error", () => {
    expect(selectChallengeDetailForRender(7, 7, false, { id: 7 })).toEqual({
      notFound: true,
      detail: undefined,
    });
  });

  it("does not leak the tombstone or previous detail into a different race", () => {
    expect(selectChallengeDetailForRender(8, 7, false, { id: 7 })).toEqual({
      notFound: false,
      detail: undefined,
    });
    expect(selectChallengeDetailForRender(8, 7, false, { id: 8 })).toEqual({
      notFound: false,
      detail: { id: 8 },
    });
  });
});
