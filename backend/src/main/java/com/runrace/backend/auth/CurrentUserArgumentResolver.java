package com.runrace.backend.auth;

import com.runrace.backend.common.ApiException;
import java.util.Optional;
import org.springframework.core.MethodParameter;
import org.springframework.core.ResolvableType;
import org.springframework.stereotype.Component;
import org.springframework.web.bind.support.WebDataBinderFactory;
import org.springframework.web.context.request.NativeWebRequest;
import org.springframework.web.method.support.HandlerMethodArgumentResolver;
import org.springframework.web.method.support.ModelAndViewContainer;

/**
 * 컨트롤러 메서드 파라미터로 현재 인증 주체를 주입한다.
 *
 * <ul>
 *   <li>{@code AuthPrincipal} — 인증 필수. 없으면 401.
 *   <li>{@code Optional<AuthPrincipal>} — 인증 선택(공개 엔드포인트). 비어 있을 수 있다.
 * </ul>
 *
 * 덕분에 컨트롤러는 {@code AuthContext.getRequired()} / {@code AuthContext.userId()}
 * 보일러플레이트 없이 시그니처만으로 인증 요구사항을 표현한다.
 */
@Component
public class CurrentUserArgumentResolver implements HandlerMethodArgumentResolver {

  @Override
  public boolean supportsParameter(MethodParameter parameter) {
    Class<?> type = parameter.getParameterType();
    if (type.equals(AuthPrincipal.class)) {
      return true;
    }
    return type.equals(Optional.class) && optionalGenericIsPrincipal(parameter);
  }

  @Override
  public Object resolveArgument(
      MethodParameter parameter,
      ModelAndViewContainer mavContainer,
      NativeWebRequest webRequest,
      WebDataBinderFactory binderFactory) {
    Optional<AuthPrincipal> principal = AuthContext.getOptional();
    if (parameter.getParameterType().equals(Optional.class)) {
      return principal;
    }
    return principal.orElseThrow(() -> ApiException.unauthorized("unauthenticated"));
  }

  private boolean optionalGenericIsPrincipal(MethodParameter parameter) {
    ResolvableType generic = ResolvableType.forMethodParameter(parameter).getGeneric(0);
    return AuthPrincipal.class.equals(generic.resolve());
  }
}
