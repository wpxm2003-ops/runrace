package com.runrace.backend.feedback.repository;

import com.runrace.backend.feedback.domain.Feedback;
import java.util.List;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

public interface FeedbackRepository extends JpaRepository<Feedback, Long> {
  List<Feedback> findAllByOrderByCreatedAtDesc(Pageable pageable);
}
