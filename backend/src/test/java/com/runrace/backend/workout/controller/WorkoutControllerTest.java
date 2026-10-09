package com.runrace.backend.workout.controller;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.runrace.backend.auth.AuthPrincipal;
import com.runrace.backend.common.ApiExceptionHandler;
import com.runrace.backend.history.service.ActivityHistoryService;
import com.runrace.backend.observability.service.ErrorLogService;
import com.runrace.backend.shoe.service.ShoeService;
import com.runrace.backend.workout.service.*;
import java.util.UUID;
import java.util.stream.Stream;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.core.MethodParameter;
import org.springframework.boot.autoconfigure.AutoConfigurations;
import org.springframework.boot.jackson.autoconfigure.JacksonAutoConfiguration;
import org.springframework.boot.test.context.ConfigDataApplicationContextInitializer;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.http.converter.json.JacksonJsonHttpMessageConverter;
import tools.jackson.databind.json.JsonMapper;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.bind.support.WebDataBinderFactory;
import org.springframework.web.context.request.NativeWebRequest;
import org.springframework.web.method.support.HandlerMethodArgumentResolver;
import org.springframework.web.method.support.ModelAndViewContainer;

class WorkoutControllerTest {
  private final WorkoutService workoutService = mock(WorkoutService.class);
  private final ErrorLogService errorLogService = mock(ErrorLogService.class);
  private MockMvc mvc;

  @BeforeEach
  void setUp() {
    var controller = new WorkoutController(workoutService, mock(WorkoutQueryService.class),
        mock(IndoorRunVoteService.class), mock(WorkoutMutationService.class),
        mock(PersonalBestService.class), mock(AchievementService.class),
        mock(ShoeService.class), mock(ActivityHistoryService.class));
    new ApplicationContextRunner()
        .withInitializer(new ConfigDataApplicationContextInitializer())
        .withConfiguration(AutoConfigurations.of(JacksonAutoConfiguration.class))
        .run(context -> {
          mvc = MockMvcBuilders.standaloneSetup(controller)
              .setMessageConverters(new JacksonJsonHttpMessageConverter(context.getBean(JsonMapper.class)))
              .setControllerAdvice(new ApiExceptionHandler(errorLogService))
              .setCustomArgumentResolvers(new HandlerMethodArgumentResolver() {
                public boolean supportsParameter(MethodParameter parameter) {
                  return parameter.getParameterType() == AuthPrincipal.class;
                }
                public Object resolveArgument(MethodParameter parameter, ModelAndViewContainer container,
                    NativeWebRequest request, WebDataBinderFactory binderFactory) {
                  return new AuthPrincipal(UUID.randomUUID(), "runner");
                }
              }).build();
        });
  }

  static Stream<Arguments> invalidBodies() {
    String times = "\"startedAt\":\"2026-10-01T00:00:00Z\",\"endedAt\":\"2026-10-01T00:01:00Z\"";
    String path = "\"path\":[{\"lat\":37.5,\"lng\":127}]";
    return Stream.of(
        Arguments.of("{" + times + "}", "path_empty"),
        Arguments.of("{" + times + ",\"path\":null}", "path_empty"),
        Arguments.of("{" + times + ",\"path\":[]}", "path_empty"),
        Arguments.of("{" + times + ",\"path\":[null]}", "path_point_invalid"),
        Arguments.of("{" + path + "}", "time_range_invalid"),
        Arguments.of("{" + path + ",\"startedAt\":null,\"endedAt\":\"2026-10-01T00:01:00Z\"}", "time_range_invalid"),
        Arguments.of("{" + path + ",\"startedAt\":\"2026-10-01T00:00:00Z\"}", "time_range_invalid"),
        Arguments.of("{" + path + ",\"startedAt\":\"bad\",\"endedAt\":\"2026-10-01T00:01:00Z\"}", "invalid_date_format")
    );
  }

  @ParameterizedTest
  @MethodSource("invalidBodies")
  void invalidInputReturns400BeforeCallingService(String body, String error) throws Exception {
    mvc.perform(post("/api/workouts").contentType(MediaType.APPLICATION_JSON).content(body))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.error").value(error));
    verifyNoInteractions(workoutService, errorLogService);
  }
}
