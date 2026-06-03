import ChallengeEditContent from "../../_components/ChallengeEditContent";
import { challengeStaticParamIds } from "@/lib/challengeRoute";

export function generateStaticParams() {
  return challengeStaticParamIds();
}

export default function ChallengeEditPage() {
  return <ChallengeEditContent />;
}
