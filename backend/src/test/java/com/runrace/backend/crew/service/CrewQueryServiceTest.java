package com.runrace.backend.crew.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.runrace.backend.common.ApiException;
import com.runrace.backend.crew.repository.CrewJoinRequestRepository;
import com.runrace.backend.crew.repository.CrewMemberRepository;
import com.runrace.backend.crew.repository.CrewRepository;
import java.util.List;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class CrewQueryServiceTest {

  @Mock CrewRepository crewRepository;
  @Mock CrewMemberRepository crewMemberRepository;
  @Mock CrewJoinRequestRepository crewJoinRequestRepository;
  @Mock CrewProfileImages crewProfileImages;
  @Mock CrewInsightsReader crewInsightsReader;

  @InjectMocks CrewQueryService service;

  @Nested
  class Discover {
    @Test
    void 유효하지_않은_지역이면_invalid_region() {
      ApiException ex = assertThrows(ApiException.class, () -> service.discover("ZZZZ", 0, 10));

      assertEquals("invalid_region", ex.code());
    }

    @Test
    void 빈_지역은_전체_조회로_허용() {
      when(crewRepository.findDiscoverableRich("", 11, 0L)).thenReturn(List.of());

      service.discover(null, 0, 10);

      verify(crewRepository).findDiscoverableRich("", 11, 0L);
    }

    @Test
    void 소문자_지역코드는_대문자로_정규화되어_전달() {
      when(crewRepository.findDiscoverableRich("SEOUL", 11, 0L)).thenReturn(List.of());

      service.discover("seoul", 0, 10);

      verify(crewRepository).findDiscoverableRich("SEOUL", 11, 0L);
    }

    @Test
    void 페이지는_offset으로_환산되어_전달() {
      when(crewRepository.findDiscoverableRich("", 11, 10L)).thenReturn(List.of());

      service.discover(null, 1, 10);

      verify(crewRepository).findDiscoverableRich("", 11, 10L);
    }
  }
}
