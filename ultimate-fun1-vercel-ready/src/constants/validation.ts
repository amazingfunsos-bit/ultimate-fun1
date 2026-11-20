// Exact validation boundaries synchronized with firebase-blueprint.json & firestore.rules
export const VALID_ID_REGEX = /^[a-zA-Z0-9_\-]+$/;
export const VALID_TIME_REGEX = /^[0-2][0-9]:[0-5][0-9]$/;

export const LIMITS = {
  ID_MAX: 128,
  USERNAME_MAX: 40,
  AVATAR_MAX: 300000,
  BAN_UNTIL_MAX: 40,
  BAN_REASON_MAX: 300,
  EMAIL_MAX: 200,
  JOKE_SETUP_MAX: 500,
  JOKE_PUNCH_MAX: 500,
  RIDDLE_Q_MAX: 600,
  RIDDLE_A_MAX: 300,
  FACT_MAX: 800,
  CHALLENGE_TITLE_MAX: 120,
  CHALLENGE_DESC_MAX: 600,
  ICON_MAX: 16,
  MEDIA_URL_MAX: 850000,
  MEDIA_CAPTION_MAX: 200,
  GAME_NAME_MAX: 80,
  GAME_DESC_MAX: 300,
  GAME_CODE_MAX: 500000,
  SCHEDULE_LABEL_MAX: 80,
  SCHEDULE_TZ_MAX: 80,
  SCHEDULE_DAYS_MAX: 7,
  CHAT_LAST_MSG_MAX: 500,
  CHAT_SENDER_NAME_MAX: 50,
  CHAT_TEXT_MAX: 1000,
  FEEDBACK_TEXT_MAX: 1000,
  ACTIVITY_ACTION_MAX: 120,
  ACTIVITY_DETAIL_MAX: 300,
  ANNOUNCEMENT_MAX: 400,
  BROADCAST_MAX: 400,
  RECOVERY_CODE_MIN: 4,
  RECOVERY_CODE_MAX: 64,
  PASSWORD_MIN: 6,
  PASSWORD_MAX: 128,
} as const;

export function sanitizeId(raw: string): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9_\-]/g, '_').slice(0, LIMITS.ID_MAX);
  return cleaned || `id_${Date.now()}`;
}

export function clampStr(val: string, max: number): string {
  return val.trim().slice(0, max);
}
