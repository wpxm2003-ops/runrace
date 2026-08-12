import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata("paceCalculator", "zh");
export { default } from "@/app/tools/_components/PaceCalculatorContent";
