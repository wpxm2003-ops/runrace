package com.runrace.backend.shoe.controller;

import com.runrace.backend.auth.AuthPrincipal;
import com.runrace.backend.common.PathPatterns;
import com.runrace.backend.shoe.domain.Shoe;
import com.runrace.backend.shoe.dto.ShoeFormRequest;
import com.runrace.backend.shoe.dto.ShoeRow;
import com.runrace.backend.shoe.service.ShoeService;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** 신발장 — 등록·목록(누적거리 포함)·수정·삭제·활성화. */
@RestController
@RequestMapping("/api/shoes")
@RequiredArgsConstructor
public class ShoeController {
  private static final String ID_PATH = PathPatterns.ID;

  private final ShoeService shoeService;

  @GetMapping
  public ResponseEntity<List<ShoeRow>> list(AuthPrincipal principal) {
    return ResponseEntity.ok(shoeService.listShoes(principal.userId()));
  }

  @PostMapping
  public ResponseEntity<ShoeRow> create(AuthPrincipal principal, @RequestBody ShoeFormRequest body) {
    Shoe shoe = shoeService.createShoe(principal.userId(), body);
    return ResponseEntity.ok(new ShoeRow(
        shoe.getId(), shoe.getBrand(), shoe.getModel(), shoe.getNickname(),
        shoe.getTargetDistanceM(), shoe.isActive(), 0L));
  }

  @PutMapping("/{id:" + ID_PATH + "}")
  public ResponseEntity<Void> update(
      AuthPrincipal principal, @PathVariable("id") Long id, @RequestBody ShoeFormRequest body) {
    shoeService.updateShoe(principal.userId(), id, body);
    return ResponseEntity.noContent().build();
  }

  @DeleteMapping("/{id:" + ID_PATH + "}")
  public ResponseEntity<Void> delete(AuthPrincipal principal, @PathVariable("id") Long id) {
    shoeService.deleteShoe(principal.userId(), id);
    return ResponseEntity.noContent().build();
  }

  @PostMapping("/{id:" + ID_PATH + "}/activate")
  public ResponseEntity<Void> activate(AuthPrincipal principal, @PathVariable("id") Long id) {
    shoeService.activateShoe(principal.userId(), id);
    return ResponseEntity.noContent().build();
  }
}
