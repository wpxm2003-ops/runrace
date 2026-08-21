import { describe, expect, it } from "vitest";
import {
  clampGoalKm,
  clampMaxMembers,
  defaultEndAtAfterStart,
  isTitleAllowed,
  plusDaysLocal,
  sanitizeDigits,
  sanitizeTitle,
  truncateToUtf8Bytes,
  utf8ByteLength,
  toChallengeFormPayload,
  validateChallengeForm,
  validateDateWindow,
  type ChallengeFormValidationMessages,
  type ChallengeFormValues,
} from "@/lib/challengeForm";

describe("utf8ByteLength / truncateToUtf8Bytes", () => {
  it("ASCII는 1바이트, 한글은 3바이트", () => {
    expect(utf8ByteLength("abc")).toBe(3);
    expect(utf8ByteLength("가")).toBe(3);
    expect(utf8ByteLength("")).toBe(0);
  });
  it("바이트 한도에서 글자 단위로 자른다", () => {
    expect(truncateToUtf8Bytes("abcdef", 3)).toBe("abc");
    expect(truncateToUtf8Bytes("가나다", 6)).toBe("가나"); // 3바이트 × 2
  });
});

describe("sanitizeTitle", () => {
  it("정상 제목은 그대로", () => {
    expect(sanitizeTitle("Morning Run")).toEqual({
      value: "Morning Run",
      removedSpecial: false,
      truncated: false,
    });
  });
  it("50바이트 초과는 잘라내고 truncated=true", () => {
    const res = sanitizeTitle("a".repeat(60));
    expect(res.value).toHaveLength(50);
    expect(res.truncated).toBe(true);
  });
});

describe("sanitizeDigits", () => {
  it("숫자만 남긴다", () => {
    expect(sanitizeDigits("a1b2")).toBe("12");
    expect(sanitizeDigits("12.3")).toBe("123");
  });
});

describe("clampGoalKm", () => {
  it("정상 값은 통과", () => {
    expect(clampGoalKm("5", "km")).toEqual({ value: "5", clamped: false });
  });
  it("상한 초과는 클램프", () => {
    expect(clampGoalKm("1001", "km")).toEqual({ value: "1000", clamped: true });
  });
  it("소수점은 하나만 유지", () => {
    expect(clampGoalKm("5.5.5", "km")).toEqual({ value: "5.55", clamped: false });
  });
  it("빈 값/점만은 그대로", () => {
    expect(clampGoalKm("", "km")).toEqual({ value: "", clamped: false });
  });
});

describe("clampMaxMembers", () => {
  it("정상 인원은 통과", () => {
    expect(clampMaxMembers("10")).toEqual({ value: "10", clamped: false });
  });
  it("50명 초과는 클램프", () => {
    expect(clampMaxMembers("99")).toEqual({ value: "50", clamped: true });
  });
  it("숫자 외 문자는 제거", () => {
    expect(clampMaxMembers("3a")).toEqual({ value: "3", clamped: false });
    expect(clampMaxMembers("")).toEqual({ value: "", clamped: false });
  });
});

describe("plusDaysLocal / defaultEndAtAfterStart", () => {
  it("일수 가감", () => {
    expect(plusDaysLocal("2026-06-04T09:30", 1)).toBe("2026-06-05T09:30");
    expect(plusDaysLocal("2026-06-04T09:30", -1)).toBe("2026-06-03T09:30");
  });
  it("기본 종료는 시작 +1시간", () => {
    expect(defaultEndAtAfterStart("2026-06-04T09:30")).toBe("2026-06-04T10:30");
  });
});

describe("isTitleAllowed", () => {
  it("내용이 있으면 true, 공백/빈값은 false", () => {
    expect(isTitleAllowed("Morning Run")).toBe(true);
    expect(isTitleAllowed("")).toBe(false);
    expect(isTitleAllowed("   ")).toBe(false);
  });
});

describe("validateChallengeForm", () => {
  // 메시지 키를 그대로 값으로 써서 어떤 규칙이 걸렸는지 식별한다.
  const msgs = Object.fromEntries(
    [
      "titleRequired", "titleSpecial", "titleMax",
      "goalRequired", "goalRange",
      "membersRequired", "membersRange",
      "startRequired", "endRequired",
      "startTooSoon", "endAfterStart", "durationTooLong", "stakeSpecial", "stakeTooLong",
    ].map((k) => [k, k]),
  ) as unknown as ChallengeFormValidationMessages;

  const valid: ChallengeFormValues = {
    title: "Race",
    goalKm: "5",
    maxMembers: "10",
    startAt: "2999-01-01T00:00",
    endAt: "2999-01-02T00:00",
    stake: "",
  };

  it("정상 폼은 null", () => {
    expect(validateChallengeForm(valid, msgs)).toBeNull();
  });

  it("제목 필수", () => {
    expect(validateChallengeForm({ ...valid, title: "  " }, msgs)).toBe("titleRequired");
  });

  it("목표 범위", () => {
    expect(validateChallengeForm({ ...valid, goalKm: "" }, msgs)).toBe("goalRequired");
    expect(validateChallengeForm({ ...valid, goalKm: "0" }, msgs)).toBe("goalRange");
    expect(validateChallengeForm({ ...valid, goalKm: "2000" }, msgs)).toBe("goalRange");
  });

  it("인원 범위", () => {
    expect(validateChallengeForm({ ...valid, maxMembers: "" }, msgs)).toBe("membersRequired");
    expect(validateChallengeForm({ ...valid, maxMembers: "0" }, msgs)).toBe("membersRange");
    expect(validateChallengeForm({ ...valid, maxMembers: "999" }, msgs)).toBe("membersRange");
  });

  it("시작/종료 필수", () => {
    expect(validateChallengeForm({ ...valid, startAt: "" }, msgs)).toBe("startRequired");
    expect(validateChallengeForm({ ...valid, endAt: "" }, msgs)).toBe("endRequired");
  });

  it("시작이 과거면 startTooSoon", () => {
    const out = validateChallengeForm(
      { ...valid, startAt: "2000-01-01T00:00", endAt: "2000-01-02T00:00" },
      msgs,
    );
    expect(out).toBe("startTooSoon");
  });

  it("종료가 시작 이전이면 endAfterStart", () => {
    const out = validateChallengeForm(
      { ...valid, startAt: "2999-01-02T00:00", endAt: "2999-01-01T00:00" },
      msgs,
    );
    expect(out).toBe("endAfterStart");
  });

  it("31일 초과면 durationTooLong", () => {
    const out = validateChallengeForm(
      { ...valid, startAt: "2999-01-01T00:00", endAt: "2999-03-01T00:00" },
      msgs,
    );
    expect(out).toBe("durationTooLong");
  });

  it("내기 문구 30자 초과면 stakeTooLong", () => {
    expect(validateChallengeForm({ ...valid, stake: "가".repeat(31) }, msgs)).toBe("stakeTooLong");
  });

  it("내기 문구 금지 문자면 stakeSpecial", () => {
    expect(validateChallengeForm({ ...valid, stake: '치킨<script>' }, msgs)).toBe("stakeSpecial");
  });

  it("내기 문구 비어있으면 통과", () => {
    expect(validateChallengeForm({ ...valid, stake: "" }, msgs)).toBeNull();
  });
});

/**
 * 추천 레이스 카드는 시작 시각을 "선택한 순간의 분"으로 채운다. 제목을 고치는 사이 분이
 * 넘어가면 그 값이 곧바로 과거가 돼 생성이 거부됐다 — 평균적으로 절반은 걸리는 경로였다.
 */
describe("방금 과거가 된 시작 시각", () => {
  const windowMsgs = {
    startRequired: "startRequired",
    endRequired: "endRequired",
    startTooSoon: "startTooSoon",
    endAfterStart: "endAfterStart",
    durationTooLong: "durationTooLong",
  };

  function localMinutesFromNow(deltaMin: number): string {
    const d = new Date();
    d.setSeconds(0, 0);
    d.setMinutes(d.getMinutes() + deltaMin);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
      + `T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  it("유예 폭 안이면 통과한다", () => {
    const out = validateDateWindow(
      localMinutesFromNow(-2),
      localMinutesFromNow(600),
      windowMsgs,
    );
    expect(out).toBeNull();
  });

  it("의도적으로 고른 과거는 그대로 거부한다", () => {
    const out = validateDateWindow(
      localMinutesFromNow(-30),
      localMinutesFromNow(600),
      windowMsgs,
    );
    expect(out).toBe("startTooSoon");
  });

  function payloadStartAt(startAt: string): number {
    const payload = toChallengeFormPayload(
      {
        title: "테스트",
        goalKm: "5",
        maxMembers: "10",
        startAt,
        endAt: localMinutesFromNow(600),
        stake: "",
      },
      "km",
    );
    return new Date(payload.startAt).getTime();
  }

  /**
   * 현재 분으로 당기는 것으로는 부족하다 — 12:34:59에 보낸 12:34가 서버에 12:35:00에
   * 닿으면 RaceRules가 다시 과거로 판정한다. "지금"을 그대로 고른 경우도 같은 이유로
   * 분 경계에서 깨지므로, 지나거나 현재인 값은 전부 다음 분으로 민다.
   */
  it("전송 값은 항상 현재 분보다 뒤다", () => {
    const nowMs = new Date(localMinutesFromNow(0)).getTime();
    for (const deltaMin of [-30, -2, 0]) {
      expect(payloadStartAt(localMinutesFromNow(deltaMin))).toBeGreaterThan(nowMs);
    }
  });

  it("미래로 고른 시작 시각은 건드리지 않는다", () => {
    const future = localMinutesFromNow(120);
    expect(payloadStartAt(future)).toBe(new Date(future).getTime());
  });
});
