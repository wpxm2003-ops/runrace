import type { Metadata } from "next";
import { pageMetadataAtPath } from "@/lib/seo";

export const metadata: Metadata = pageMetadataAtPath(
  "guides",
  "ko",
  "/guides/app",
);

export default function AppGuideLayout({ children }: { children: React.ReactNode }) {
  return children;
}
