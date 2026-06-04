package com.runrace.backend.auth.dto;

import com.runrace.backend.user.AppUser;
import java.util.UUID;

public record MeResponse(
    UUID id,
    String firebaseUid,
    String email,
    String displayName,
    String nickname,
    String photoUrl,
    String provider) {

  public static MeResponse from(AppUser user) {
    return new MeResponse(
        user.getId(),
        user.getFirebaseUid(),
        user.getEmail(),
        user.getDisplayName(),
        user.getNickname(),
        user.getPhotoUrl(),
        user.getProvider());
  }
}
