import { describe, expect, it } from "vitest";
import { createClientWorkoutId } from "@/lib/workoutRequestId";

describe("createClientWorkoutId", () => {
  it("creates unique UUID request identifiers", () => {
    const first = createClientWorkoutId();
    const second = createClientWorkoutId();

    expect(first).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(second).not.toBe(first);
  });
});
