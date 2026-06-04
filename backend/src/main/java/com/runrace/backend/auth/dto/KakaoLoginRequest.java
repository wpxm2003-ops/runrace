package com.runrace.backend.auth.dto;

public record KakaoLoginRequest(String code, String redirectUri) {}
