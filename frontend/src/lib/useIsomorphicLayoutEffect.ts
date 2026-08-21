"use client";

import { useEffect, useLayoutEffect } from "react";

/**
 * SSR·정적 프리렌더에서 useLayoutEffect 경고를 피하면서, 클라이언트에서는 페인트 전에
 * 실행한다. 커밋된 상태를 React 밖(전역 모듈·DOM)에 반영해야 하는데 첫 페인트에 이미
 * 반영돼 있어야 하는 경우에 쓴다.
 */
export const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;
