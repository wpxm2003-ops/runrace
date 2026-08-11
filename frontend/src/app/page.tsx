import type { Metadata } from "next";
import HomeContent from "@/app/_components/HomeContent";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata("home", "ko");

export default function Page() {
  return <HomeContent />;
}
