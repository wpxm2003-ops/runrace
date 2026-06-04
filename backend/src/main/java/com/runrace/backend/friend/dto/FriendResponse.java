package com.runrace.backend.friend.dto;

import java.util.UUID;

public record FriendResponse(UUID id, String nickname, String photoUrl, String email) {}
