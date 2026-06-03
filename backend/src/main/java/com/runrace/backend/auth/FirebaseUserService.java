package com.runrace.backend.auth;

import com.google.firebase.auth.FirebaseToken;
import com.runrace.backend.user.AppUser;
import com.runrace.backend.user.AppUserRepository;
import java.time.OffsetDateTime;
import java.util.Map;
import java.util.Optional;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class FirebaseUserService {
  private final AppUserRepository appUserRepository;

  @Transactional
  public AuthPrincipal upsertAndCreatePrincipal(FirebaseToken token) {
    String uid = token.getUid();
    Optional<AppUser> existing = appUserRepository.findByFirebaseUid(uid);

    AppUser user = existing.orElseGet(AppUser::new);
    boolean isNew = user.getId() == null;
    user.setFirebaseUid(uid);
    user.setEmail(token.getEmail());
    user.setDisplayName(token.getName());
    user.setPhotoUrl(token.getPicture());
    user.setProvider(extractSignInProvider(token).orElse(null));
    if (isNew) {
      user.setCreatedAt(OffsetDateTime.now());
    }

    AppUser saved = appUserRepository.save(user);
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

