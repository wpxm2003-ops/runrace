import type { User } from "firebase/auth";
import { apiFetch, uploadMultipart } from "./client";

export type FeedbackType = "IDEA" | "INCONVENIENCE" | "BUG" | "ETC";

export type CreateFeedbackInput = {
  type: FeedbackType;
  title: string;
  content: string;
  imageUrls: string[];
  pageUrl?: string;
  userAgent?: string;
  appVersion?: string;
};

export function uploadFeedbackImage(file: File, user: User) {
  return uploadMultipart("/api/uploads/feedback-image", file, user, "url");
}

export function createFeedback(input: CreateFeedbackInput, user: User) {
  return apiFetch<{ id: number }>("/api/feedback", {
    method: "POST",
    user,
    body: input,
    returnTo: "/feedback",
  });
}
