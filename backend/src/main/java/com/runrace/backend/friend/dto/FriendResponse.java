package com.runrace.backend.friend.dto;

import java.util.UUID;

public record FriendResponse(UUID id, String displayName, String photoUrl, String email) {}
