import type { User } from "firebase/auth";
import useSWR from "swr";
import { BASE_CONFIG } from "./hookConfig";
import { fetchRivals } from "./rivals";

export function useRivals(user: User | null) {
  return useSWR(
    user ? (["rivals", user.uid] as const) : null,
    () => fetchRivals(user!),
    BASE_CONFIG,
  );
}
