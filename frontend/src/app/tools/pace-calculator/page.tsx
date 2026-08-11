import type { Metadata } from "next";
import PaceCalculatorContent from "../_components/PaceCalculatorContent";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata("paceCalculator", "ko");

export default function PaceCalculatorPage() {
  return <PaceCalculatorContent />;
}
