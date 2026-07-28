import { nsmReportStaticParamIds } from "@/lib/nsmReportRoute";
import NsmBlockReportContent from "./_components/NsmBlockReportContent";

export function generateStaticParams() {
  return nsmReportStaticParamIds();
}

export default function NsmBlockReportPage() {
  return <NsmBlockReportContent />;
}
