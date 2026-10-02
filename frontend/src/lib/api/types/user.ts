export type MeResponse = {
  id: string;
  firebaseUid: string;
  email: string | null;
  displayName: string | null;
  nickname: string | null;
  provider: string | null;
  langCd: string;
  timeZone: string;
};
