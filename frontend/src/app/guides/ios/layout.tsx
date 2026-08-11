import type { Metadata } from "next";
import { pageMetadataAtPath } from "@/lib/seo";

export const metadata: Metadata = pageMetadataAtPath(
  "guides",
  "ko",
  "/guides/ios",
);

export default function IosGuideLayout({ children }: { children: React.ReactNode }) {
  return children;
}
