import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata("privacy", "ko");

export default function PrivacyLayout({ children }: { children: React.ReactNode }) {
  return children;
}
