package com.runrace.backend.challenge.dto;

import com.runrace.backend.challenge.domain.PrizeAwardType;
import java.util.List;

public record PrizeSaveRequest(PrizeAwardType awardType, List<PrizeItemRequest> prizes) {}
