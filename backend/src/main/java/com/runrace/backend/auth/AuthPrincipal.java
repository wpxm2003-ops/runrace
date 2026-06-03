package com.runrace.backend.auth;

import java.util.UUID;

public record AuthPrincipal(UUID userId, String firebaseUid) {}

