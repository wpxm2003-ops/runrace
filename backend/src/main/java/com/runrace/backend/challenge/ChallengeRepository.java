package com.runrace.backend.challenge;

import org.springframework.data.jpa.repository.JpaRepository;

public interface ChallengeRepository
    extends JpaRepository<Challenge, Long>, ChallengeRepositoryCustom {
}
