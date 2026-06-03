import ChallengeDetailContent from "../_components/ChallengeDetailContent";
import { challengeStaticParamIds } from "@/lib/challengeRoute";

export function generateStaticParams() {
  return challengeStaticParamIds();
}

export default function ChallengeDetailPage() {
  return <ChallengeDetailContent />;
}
