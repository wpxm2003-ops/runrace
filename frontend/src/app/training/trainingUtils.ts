import type { Translations } from "@/lib/i18n/translations";
import { formatPaceSec, type NsmSession, type NsmVolumeBand } from "@/lib/nsm";

export const DISTANCES = [
  { label: "3K", m: 3000 },
  { label: "5K", m: 5000 },
  { label: "10K", m: 10000 },
  { label: "Half", m: 21097 },
  { label: "Full", m: 42195 },
];

export const PB_LABEL: Record<string, string> = {
  "3k": "3K", "5k": "5K", "10k": "10K", half: "Half", marathon: "Full",
};

export function parseTime(v: string): number | null {
  const match = v.trim().match(/^(\d{1,3}):(\d{2})$/);
  if (!match) return null;
  const min = Number(match[1]);
  const sec = Number(match[2]);
  if (sec >= 60 || min > 420) return null;
  return min * 60 + sec;
}

export function maskTimeInput(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 5);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, -2)}:${digits.slice(-2)}`;
}

export function formatTime(sec: number): string {
  const min = Math.floor(sec / 60);
  const seconds = Math.round(sec % 60);
  return `${min}:${String(seconds).padStart(2, "0")}`;
}

export function daysSince(iso: string): number {
  return (Date.now() - new Date(iso).getTime()) / 86_400_000;
}

export function volumeBandLabel(band: NsmVolumeBand, t: Translations): string {
  switch (band) {
    case 0: return t.nsm_volume_band_0;
    case 1: return t.nsm_volume_band_1;
    case 2: return t.nsm_volume_band_2;
    case 3: return t.nsm_volume_band_3;
    case 4: return t.nsm_volume_band_4;
  }
}

export function sessionLabel(
  session: NsmSession,
  t: Translations,
): { title: string; sub: string; tag: string } {
  if (session.kind === "EASY") return { title: t.nsm_easy_title, sub: t.nsm_easy_sub, tag: "EASY" };
  if (session.kind === "LONGRUN") return { title: t.nsm_longrun_title, sub: t.nsm_longrun_sub, tag: "LONG RUN" };
  const name = session.kind === "SHORT" ? "Short" : session.kind === "MEDIUM" ? "Medium" : "Long";
  const title = `${name} — ${session.reps} × ${session.repAmount}${session.repUnit}`;
  const sub = session.targetPaceSec
    ? t.nsm_session_sub(formatPaceSec(session.targetPaceSec), session.restSec ?? 0)
    : "";
  return { title, sub, tag: "sub-T" };
}
