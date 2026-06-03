package com.runrace.backend.auth;

import com.google.auth.oauth2.GoogleCredentials;
import com.google.firebase.FirebaseApp;
import com.google.firebase.FirebaseOptions;
import jakarta.annotation.PostConstruct;
import java.io.FileInputStream;
import java.io.IOException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.util.StringUtils;

@Configuration
public class FirebaseAdminConfig {

  @Value("${runrace.auth.firebase.enabled:true}")
  private boolean enabled;

  @Value("${runrace.auth.firebase.serviceAccountPath:../secrets/firebase-service-account.json}")
  private String serviceAccountPath;

  @PostConstruct
  void init() throws IOException {
    if (!enabled) return;
    if (FirebaseApp.getApps().stream().findAny().isPresent()) return;
    if (!StringUtils.hasText(serviceAccountPath)) return;

    try (FileInputStream serviceAccount = new FileInputStream(serviceAccountPath)) {
      FirebaseOptions options =
          FirebaseOptions.builder()
              .setCredentials(GoogleCredentials.fromStream(serviceAccount))
              .build();
      FirebaseApp.initializeApp(options);
    }
  }
}
