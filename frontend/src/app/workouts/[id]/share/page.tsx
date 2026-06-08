import { workoutStaticParamIds } from "@/lib/workoutRoute";
import WorkoutShareContent from "./_components/WorkoutShareContent";

export function generateStaticParams() {
  return workoutStaticParamIds();
}

export default function WorkoutSharePage() {
  return <WorkoutShareContent />;
}
