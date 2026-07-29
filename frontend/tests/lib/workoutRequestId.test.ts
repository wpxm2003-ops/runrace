import { afterEach, describe, expect, it, vi } from "vitest";
import { createClientWorkoutId } from "@/lib/workoutRequestId";

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("createClientWorkoutId", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("creates unique UUID request identifiers", () => {
    const first = createClientWorkoutId();
    const second = createClientWorkoutId();

    expect(first).toMatch(UUID_V4);
    expect(second).not.toBe(first);
  });

  it("randomUUID가 없는 환경(비보안 컨텍스트 WebView)에서도 유효한 v4 UUID를 만든다", () => {
    const original = globalThis.crypto;
    // randomUUID만 뺀 crypto로 교체 — 수동 비트 조작 폴백 분기를 태운다.
    vi.stubGlobal("crypto", {
      getRandomValues: (arr: Uint8Array) => original.getRandomValues(arr),
    });

    const id = createClientWorkoutId();

    // 정규식이 version(4)·variant(8/9/a/b) 비트까지 검증한다.
    expect(id).toMatch(UUID_V4);
  });
});
