import { redirect } from "next/navigation";
import { parseChallengeId } from "@/lib/challengeRoute";

/** 예전 /challenges/edit?id=123 링크 호환 — 서버에서 즉시 리다이렉트. */
export default async function LegacyChallengeEditQueryPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  const { id: rawId } = await searchParams;
  const id = parseChallengeId(rawId ?? null);
  if (id != null) {
    redirect(`/challenges/${id}/edit`);
  }
  redirect("/challenges");
}
