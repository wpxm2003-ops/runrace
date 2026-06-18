import type { User } from "firebase/auth";
import { compressImageForUpload } from "@/lib/compressImage";
import { apiFetch, apiUrl, publicFetch } from "./client";
import type {
  CreatedId,
  IndoorRunCreateBody,
  WorkoutCreateBody,
  WorkoutDetail,
  WorkoutListItem,
  WorkoutShare,
  WorkoutSummary,
} from "./types";

/** 내정보 — 전체 운동 기록 요약. */
export function fetchWorkoutSummary(user: User) {
  return apiFetch<WorkoutSummary>("/api/workouts/summary", { user });
}

/** 기록 탭 달력 — 연도별 운동 목록. */
export function fetchWorkoutsByYear(user: User, year: number) {
  return apiFetch<WorkoutListItem[]>(`/api/workouts?year=${year}`, { user });
}

export function fetchWorkout(id: number, user: User) {
  return apiFetch<WorkoutDetail>(`/api/workouts/${id}`, { user });
}

export function createWorkout(body: WorkoutCreateBody, user: User) {
  return apiFetch<CreatedId>("/api/workouts", { method: "POST", user, body });
}

/** 정적 export 환경에서 DELETE가 막히는 경우가 있어 POST .../delete 를 사용한다. */
export function deleteWorkout(id: number, user: User) {
  return apiFetch<void>(`/api/workouts/${id}/delete`, { method: "POST", user });
}

/** 실내러닝 등록. */
export function createIndoorRun(body: IndoorRunCreateBody, user: User) {
  return apiFetch<CreatedId>("/api/workouts/indoor", { method: "POST", user, body });
}

/** 실내러닝 승인/거부 투표. */
export function voteIndoorRun(workoutId: number, approved: boolean, user: User) {
  return apiFetch<void>(`/api/workouts/${workoutId}/vote`, { method: "POST", user, body: { approved } });
}

/** 운동 메모 수정. 빈 문자열 전달 시 삭제. */
export function updateWorkoutMemo(id: number, memo: string, user: User) {
  return apiFetch<void>(`/api/workouts/${id}/memo`, { method: "PATCH", user, body: { memo } });
}

/** 공개 공유 페이지용 운동 데이터 (인증 불필요). */
export function fetchWorkoutShare(id: number) {
  return publicFetch<WorkoutShare>(`/api/workouts/${id}/share`);
}

/** 이미지 업로드 — multipart/form-data. URL 반환. */
export async function uploadImage(
  file: File,
  user: User,
  opts?: { precompressed?: boolean },
): Promise<string> {
  const token = await user.getIdToken();
  const uploadFile = opts?.precompressed ? file : await compressImageForUpload(file);
  const formData = new FormData();
  formData.append("file", uploadFile);
  const res = await fetch(apiUrl("/api/uploads/image"), {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });
  if (!res.ok) {
    if (res.status === 413) {
      throw new Error("upload_too_large");
    }
    const err = await res.text().catch(() => String(res.status));
    throw new Error(err);
  }
  const data = (await res.json()) as { url: string };
  return data.url;
}
