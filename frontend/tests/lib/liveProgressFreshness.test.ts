import { describe, expect, it } from "vitest";
import { isLatestLiveProgressResponse } from "@/lib/liveProgressFreshness";

describe("live progress response freshness", () => {
  it("같은 계정의 이전 런 응답도 적용하지 않는다", () => {
    expect(isLatestLiveProgressResponse("run-old", 100, "run-new", 100)).toBe(false);
  });

  it("같은 런이어도 더 최신 요청이 발급된 뒤 도착한 응답은 적용하지 않는다", () => {
    expect(isLatestLiveProgressResponse("run-a", 100, "run-a", 101)).toBe(false);
  });

  it("현재 런의 가장 최신 응답만 적용한다", () => {
    expect(isLatestLiveProgressResponse("run-a", 101, "run-a", 101)).toBe(true);
  });
});
