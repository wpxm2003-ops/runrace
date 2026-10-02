import type { User } from "firebase/auth";
import useSWR from "swr";
import { BASE_CONFIG } from "./hookConfig";
import { fetchShoes } from "./shoes";

export function useShoes(user: User | null) {
  return useSWR(
    user ? (["shoes", user.uid] as const) : null,
    () => fetchShoes(user!),
    BASE_CONFIG,
  );
}
