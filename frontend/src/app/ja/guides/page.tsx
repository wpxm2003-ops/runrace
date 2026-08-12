import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata("guides", "ja");
export { default } from "@/app/guides/page";
