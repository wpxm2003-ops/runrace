package com.runrace.backend.auth;

import com.google.firebase.auth.FirebaseToken;
import com.runrace.backend.user.AppUser;
import java.util.Map;
import java.util.Optional;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class FirebaseUserService {
  private final UserProvisioningService userProvisioningService;

  public AuthPrincipal upsertAndCreatePrincipal(FirebaseToken token) {
    AppUser saved =
        userProvisioningService.upsert(
            token.getUid(),
            token.getEmail(),
            token.getName(),
            token.getPicture(),
            extractSignInProvider(token).orElse(null));
    return new AuthPrincipal(saved.getId(), saved.getFirebaseUid());
  }

  private Optional<String> extractSignInProvider(FirebaseToken token) {
    Object firebaseClaim = token.getClaims().get("firebase");
    if (!(firebaseClaim instanceof Map<?, ?> firebaseMap)) {
      return Optional.empty();
    }
    Object provider = firebaseMap.get("sign_in_provider");
    if (provider == null) {
      return Optional.empty();
    }
    return Optional.of(String.valueOf(provider));
  }
}
