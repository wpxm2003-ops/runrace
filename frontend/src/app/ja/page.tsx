import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata("home", "ja");
export { default } from "@/app/_components/HomeContent";
