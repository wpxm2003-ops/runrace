// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  PUSH_PROMPT_SNOOZE_MS,
  canShowPushPrompt,
  isFirstWorkoutSave,
  isPushPromptReady,
  isWorkoutRecordingPath,
  loadPushPromptRecord,
  markPushPromptAnswered,
  onPushPromptTrigger,
  snoozePushPrompt,
  triggerPushPrompt,
} from "@/lib/pushPrompt";

const NOW = Date.UTC(2026, 10, 25, 9, 0, 0);
const DAY = 24 * 60 * 60 * 1000;

beforeEach(() => localStorage.clear());

describe("canShowPushPrompt", () => {
  it("shows only while the OS can still ask", () => {
    expect(canShowPushPrompt("prompt", null, NOW)).toBe(true);
    expect(canShowPushPrompt("granted", null, NOW)).toBe(false);
    expect(canShowPushPrompt("denied", null, NOW)).toBe(false);
    expect(canShowPushPrompt("unsupported", null, NOW)).toBe(false);
  });

  it("stays quiet for 7 days after 'later', then asks again", () => {
    const record = { snoozedUntil: NOW + PUSH_PROMPT_SNOOZE_MS };
    expect(PUSH_PROMPT_SNOOZE_MS).toBe(7 * DAY);
    expect(canShowPushPrompt("prompt", record, NOW + 6 * DAY)).toBe(false);
    expect(canShowPushPrompt("prompt", record, NOW + 7 * DAY - 1)).toBe(false);
    expect(canShowPushPrompt("prompt", record, NOW + 7 * DAY)).toBe(true);
  });

  it("never auto-shows again once the OS dialog was answered", () => {
    expect(canShowPushPrompt("prompt", { answered: true }, NOW)).toBe(false);
    expect(canShowPushPrompt("prompt", { answered: true, snoozedUntil: 0 }, NOW + 30 * DAY)).toBe(false);
  });
});

describe("prompt record storage", () => {
  it("snoozes for 7 days from now", () => {
    snoozePushPrompt(NOW);
    expect(loadPushPromptRecord()).toEqual({ snoozedUntil: NOW + 7 * DAY });
    expect(canShowPushPrompt("prompt", loadPushPromptRecord(), NOW + DAY)).toBe(false);
  });

  it("keeps the snooze when marking answered", () => {
    snoozePushPrompt(NOW);
    markPushPromptAnswered();
    expect(loadPushPromptRecord()).toEqual({ snoozedUntil: NOW + 7 * DAY, answered: true });
  });

  it("treats broken storage as no record", () => {
    localStorage.setItem("runrace_push_prompt", "{not json");
    expect(loadPushPromptRecord()).toBeNull();
    localStorage.setItem("runrace_push_prompt", "3");
    expect(loadPushPromptRecord()).toBeNull();
  });
});

describe("prompt timing", () => {
  it("recognizes the workout recording screens, not workout details", () => {
    expect(isWorkoutRecordingPath("/workout")).toBe(true);
    expect(isWorkoutRecordingPath("/workout/")).toBe(true);
    expect(isWorkoutRecordingPath("/workout.html")).toBe(true);
    expect(isWorkoutRecordingPath("/workout/indoor")).toBe(true);
    expect(isWorkoutRecordingPath("/workouts/12")).toBe(false);
    expect(isWorkoutRecordingPath("/training")).toBe(false);
    expect(isWorkoutRecordingPath("/")).toBe(false);
  });

  it("waits to leave the recording screen after the first workout", () => {
    expect(isPushPromptReady("first_workout", "/workout")).toBe(false);
    expect(isPushPromptReady("first_workout", "/workouts/12")).toBe(true);
    expect(isPushPromptReady("race_joined", "/challenges/3")).toBe(true);
    expect(isPushPromptReady("race_created", "/challenges")).toBe(true);
  });

  it("uses the server FIRST_RUN achievement as the first workout signal", () => {
    expect(isFirstWorkoutSave([{ code: "FIRST_RUN", value: null, value2: null }])).toBe(true);
    expect(isFirstWorkoutSave([{ code: "STREAK", value: 3, value2: null }])).toBe(false);
    expect(isFirstWorkoutSave([])).toBe(false);
    expect(isFirstWorkoutSave(undefined)).toBe(false);
  });
});

describe("trigger bus", () => {
  it("delivers triggers to subscribers until released", () => {
    const listener = vi.fn();
    const release = onPushPromptTrigger(listener);
    triggerPushPrompt("race_joined");
    release();
    triggerPushPrompt("race_created");
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith("race_joined");
  });

  it("does not let a broken subscriber break the caller", () => {
    const releaseBroken = onPushPromptTrigger(() => {
      throw new Error("boom");
    });
    const listener = vi.fn();
    const release = onPushPromptTrigger(listener);
    expect(() => triggerPushPrompt("first_workout")).not.toThrow();
    expect(listener).toHaveBeenCalledWith("first_workout");
    releaseBroken();
    release();
  });
});
