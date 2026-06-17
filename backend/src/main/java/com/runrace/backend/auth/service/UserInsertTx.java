package com.runrace.backend.auth.service;

import com.runrace.backend.user.domain.AppUser;
import com.runrace.backend.user.repository.AppUserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * 신규 사용자 INSERT를 독립 트랜잭션(REQUIRES_NEW)으로 수행한다.
 * 유니크 제약 위반 시 이 트랜잭션만 롤백되고, 호출 측(upsert) 트랜잭션은 살아남아 재시도할 수 있다.
 * (같은 트랜잭션에서 제약 위반을 잡으면 rollback-only로 오염되어 재시도가 불가능하므로 분리한다.)
 */
@Component
@RequiredArgsConstructor
class UserInsertTx {

  private final AppUserRepository appUserRepository;

  /** saveAndFlush로 INSERT를 즉시 수행해 유니크 위반을 이 트랜잭션 안에서 발생시킨다. */
  @Transactional(propagation = Propagation.REQUIRES_NEW)
  public AppUser insert(AppUser user) {
    return appUserRepository.saveAndFlush(user);
  }
}
