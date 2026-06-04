package com.runrace.backend.push.dto;

public record UpsertDeviceTokenRequest(String platform, String fcmToken) {}
