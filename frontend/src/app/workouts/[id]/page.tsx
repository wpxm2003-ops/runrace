import { Suspense } from "react";
import WorkoutDetailContent from "../_components/WorkoutDetailContent";
import { workoutStaticParamIds } from "@/lib/workoutRoute";

export function generateStaticParams() {
  return workoutStaticParamIds();
}

export default function WorkoutDetailPage() {
  return (
    <Suspense fallback={null}>
      <WorkoutDetailContent />
    </Suspense>
  );
}
