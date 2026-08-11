import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata("guides", "ko");

export default function GuidesLayout({ children }: { children: React.ReactNode }) {
  return children;
}
