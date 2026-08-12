import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata("home", "zh");
export { default } from "@/app/_components/HomeContent";
