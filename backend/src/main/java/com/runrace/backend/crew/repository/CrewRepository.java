package com.runrace.backend.crew.repository;

import com.runrace.backend.crew.domain.Crew;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface CrewRepository extends JpaRepository<Crew, Long> {
  Optional<Crew> findByJoinCode(String joinCode);

  boolean existsByJoinCode(String joinCode);

  boolean existsByName(String name);
}
