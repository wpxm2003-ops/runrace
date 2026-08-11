export type LocaleSource =
  | "initial"
  | "path"
  | "stored"
  | "browser"
  | "default"
  | "user";

/** A localized SEO URL may choose the page language, but it is not a preference change. */
export function shouldSyncLocaleToServer(source: LocaleSource): boolean {
  return source !== "initial" && source !== "path";
}
