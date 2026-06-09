package com.runrace.backend.config;

import org.springframework.context.MessageSource;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.support.ReloadableResourceBundleMessageSource;

/** 푸시 알림 등 서버 발신 문구의 다국어 번들. messages[_xx].properties (UTF-8). */
@Configuration
public class I18nConfig {

  @Bean
  public MessageSource messageSource() {
    ReloadableResourceBundleMessageSource ms = new ReloadableResourceBundleMessageSource();
    ms.setBasename("classpath:messages");
    ms.setDefaultEncoding("UTF-8");
    // 해당 로케일 번들이 없으면 시스템 로케일이 아니라 기본 번들(messages.properties=한국어)로 폴백.
    ms.setFallbackToSystemLocale(false);
    return ms;
  }
}
