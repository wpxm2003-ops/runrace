export type ChallengeDetailRenderState<Detail extends { id: number }> = {
  notFound: boolean;
  detail: Detail | undefined;
};

/** Keep a confirmed 404 authoritative even after its SWR error cache is cleared. */
export function selectChallengeDetailForRender<Detail extends { id: number }>(
  id: number | null,
  notFoundId: number | null,
  fetchedNotFound: boolean,
  cachedDetail: Detail | undefined,
): ChallengeDetailRenderState<Detail> {
  const notFound = id != null && (fetchedNotFound || notFoundId === id);
  const detail =
    !notFound && cachedDetail?.id === id ? cachedDetail : undefined;
  return { notFound, detail };
}
