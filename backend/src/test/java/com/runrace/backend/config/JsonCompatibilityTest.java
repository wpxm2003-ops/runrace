package com.runrace.backend.config;

import static org.assertj.core.api.Assertions.assertThat;

import com.runrace.backend.workout.dto.CreateWorkoutRequest;
import com.runrace.backend.workout.dto.PathPointDto;
import java.time.OffsetDateTime;
import org.junit.jupiter.api.Test;
import org.springframework.boot.autoconfigure.AutoConfigurations;
import org.springframework.boot.jackson.autoconfigure.JacksonAutoConfiguration;
import org.springframework.boot.test.context.ConfigDataApplicationContextInitializer;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import tools.jackson.databind.json.JsonMapper;

class JsonCompatibilityTest {
  private final ApplicationContextRunner context = new ApplicationContextRunner()
      .withInitializer(new ConfigDataApplicationContextInitializer())
      .withConfiguration(AutoConfigurations.of(JacksonAutoConfiguration.class));

  @Test
  void oldClientsCanOmitPrimitiveFieldsAndSendUnknownFields() {
    context.run(ctx -> {
      var request = ctx.getBean(JsonMapper.class).readValue(
          "{\"path\":[{\"lat\":37.5,\"lng\":127}],\"futureField\":true}",
          CreateWorkoutRequest.class);
      assertThat(request.durationSec()).isZero();
      assertThat(request.path().getFirst().lat()).isEqualTo(37.5);
      assertThat(request.startedAt()).isNull();
    });
  }

  @Test
  void oldGpsJsonWithoutOptionalFieldsStillRoundTrips() {
    context.run(ctx -> {
      var mapper = ctx.getBean(JsonMapper.class);
      var point = mapper.readValue("{\"lat\":37.5,\"lng\":127,\"t\":1000}", PathPointDto.class);
      assertThat(point.ele()).isNull();
      assertThat(point.breakBefore()).isNull();
      var json = mapper.readTree(mapper.writeValueAsString(point));
      assertThat(json.has("breakBefore")).isFalse();
      assertThat(json.get("t").asLong()).isEqualTo(1000);
    });
  }

  @Test
  void datesRemainIsoStringsInsteadOfNumericTimestamps() {
    context.run(ctx -> {
      var mapper = ctx.getBean(JsonMapper.class);
      assertThat(mapper.writeValueAsString(OffsetDateTime.parse("2026-10-01T00:00:00Z")))
          .isEqualTo("\"2026-10-01T00:00:00Z\"");
    });
  }
}
