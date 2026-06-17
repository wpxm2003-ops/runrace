package com.runrace.backend.challenge.repository;

import com.runrace.backend.challenge.domain.Challenge;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ChallengeRepository
    extends JpaRepository<Challenge, Long>, ChallengeRepositoryCustom {
}
