package com.runrace.backend.user.repository;

import com.runrace.backend.user.domain.QAppUser;
import com.querydsl.jpa.impl.JPAQueryFactory;
import java.util.Optional;
import java.util.UUID;
import lombok.RequiredArgsConstructor;

@RequiredArgsConstructor
public class AppUserRepositoryImpl implements AppUserRepositoryCustom {

  private static final QAppUser appUser = QAppUser.appUser;

  private final JPAQueryFactory query;

  @Override
  public Optional<String> findLangCdById(UUID id) {
    return Optional.ofNullable(
        query.select(appUser.langCd)
            .from(appUser)
            .where(appUser.id.eq(id))
            .fetchOne());
  }

  @Override
  public Optional<Boolean> findPushEnabledById(UUID id) {
    return Optional.ofNullable(
        query.select(appUser.pushEnabled)
            .from(appUser)
            .where(appUser.id.eq(id))
            .fetchOne());
  }
}
