const LAUNCHPAD_APP_ID = "1c7980ad-125b-4fa6-8223-132868368b2d";

/** LaunchPad 품앗이 테스터 검증 (Google 로그인 성공 후 호출) */
export async function verifyLaunchpadTester(
  googleEmail: string | null | undefined,
): Promise<void> {
  if (!googleEmail) return;
  try {
    await fetch("https://apptesters.cc/api/verify-tester", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        appId: LAUNCHPAD_APP_ID,
        testerEmail: googleEmail,
      }),
    });
  } catch {
    // LaunchPad 검증 실패는 로그인 흐름을 막지 않음
  }
}
