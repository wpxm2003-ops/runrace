package com.runrace.backend.challenge.controller;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.runrace.backend.auth.AuthPrincipal;
import com.runrace.backend.challenge.domain.PrizeAwardType;
import com.runrace.backend.challenge.dto.PrizeItemRequest;
import com.runrace.backend.challenge.dto.PrizeResultResponse;
import com.runrace.backend.challenge.dto.PrizeRow;
import com.runrace.backend.challenge.dto.PrizeSaveRequest;
import com.runrace.backend.challenge.service.ChallengePrizeService;
import com.runrace.backend.challenge.service.PrizeResultService;
import com.runrace.backend.common.PathPatterns;
import com.runrace.backend.upload.ImageUploadService;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** 레이스 경품 — 목록(공개)·저장(생성자)·기프티콘 이미지(종료+해당 등수 게이트). */
@RestController
@RequestMapping("/api/challenges/{id:" + PathPatterns.ID + "}/prizes")
@RequiredArgsConstructor
public class ChallengePrizeController {

  private final ChallengePrizeService prizeService;
  private final PrizeResultService prizeResultService;
  private final ObjectMapper objectMapper;

  /** 경품 목록 — 전체 공개(경품명·이미지 유무만). S3 키는 반환하지 않는다. */
  @GetMapping
  public ResponseEntity<List<PrizeRow>> list(@PathVariable("id") Long id) {
    return ResponseEntity.ok(prizeService.list(id));
  }

  /** 경품 저장(전체 교체) — 생성자만, 시작 전만. */
  @PutMapping
  public ResponseEntity<Void> save(
      AuthPrincipal principal, @PathVariable("id") Long id, @RequestBody JsonNode body) {
    PrizeSaveRequest request = body.isArray()
        ? new PrizeSaveRequest(
            PrizeAwardType.RANK,
            objectMapper.convertValue(body, new TypeReference<List<PrizeItemRequest>>() {}))
        : objectMapper.convertValue(body, PrizeSaveRequest.class);
    prizeService.save(principal.userId(), id, request.awardType(), request.prizes());
    return ResponseEntity.noContent().build();
  }

  @GetMapping("/result")
  public ResponseEntity<PrizeResultResponse> result(
      AuthPrincipal principal, @PathVariable("id") Long id) {
    return ResponseEntity.ok(prizeResultService.getMyResult(principal.userId(), id));
  }

  /** 기프티콘 이미지 — 종료 + 해당 등수 당첨자만. 바이트 직접 스트리밍(URL 미노출). */
  @GetMapping("/{rank:" + PathPatterns.ID + "}/image")
  public ResponseEntity<byte[]> image(
      AuthPrincipal principal, @PathVariable("id") Long id, @PathVariable("rank") int rank) {
    ImageUploadService.StoredImage img = prizeService.getPrizeImage(principal.userId(), id, rank);
    return ResponseEntity.ok()
        .contentType(MediaType.parseMediaType(img.contentType()))
        .body(img.bytes());
  }
}
