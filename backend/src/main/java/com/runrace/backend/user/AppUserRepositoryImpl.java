package com.runrace.backend.user;

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
}
