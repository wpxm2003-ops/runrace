/** next build / generateMetadata 등 Node fetch용 절대 API 베이스 URL */
export function resolveServerApiBaseUrl(): string {
  for (const key of ["API_BASE_URL", "NEXT_PUBLIC_API_BASE_URL"] as const) {
    const raw = process.env[key];
    if (raw !== undefined && raw.trim() !== "") {
      return raw.trim().replace(/\/$/, "");
    }
  }
  return (process.env.NEXT_PUBLIC_APP_URL ?? "https://runrace.co.kr").replace(/\/$/, "");
}
