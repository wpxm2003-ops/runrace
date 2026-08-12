import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata("guides", "es");
export { default } from "@/app/guides/page";
