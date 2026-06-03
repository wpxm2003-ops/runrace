import WorkoutDetailContent from "../_components/WorkoutDetailContent";
import { workoutStaticParamIds } from "@/lib/workoutRoute";

export function generateStaticParams() {
  return workoutStaticParamIds();
}

export default function WorkoutDetailPage() {
  return <WorkoutDetailContent />;
}
