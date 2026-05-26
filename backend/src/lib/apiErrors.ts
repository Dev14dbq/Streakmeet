import type { Response } from 'express'

/** Machine-readable API error codes */
export const ErrorCodes = {
  UNAUTHORIZED: 'UNAUTHORIZED',
  INVALID_TOKEN: 'INVALID_TOKEN',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  ACCOUNT_DELETED: 'ACCOUNT_DELETED',
  ACCOUNT_RETENTION_EXPIRED: 'ACCOUNT_RETENTION_EXPIRED',
  OAUTH_INVALID_TOKEN: 'OAUTH_INVALID_TOKEN',
  OAUTH_NOT_CONFIGURED: 'OAUTH_NOT_CONFIGURED',
  RESTORE_ACCOUNT_FAILED: 'RESTORE_ACCOUNT_FAILED',

  MISSING_FIELD: 'MISSING_FIELD',
  INVALID_EMAIL: 'INVALID_EMAIL',
  INVALID_TIMEZONE: 'INVALID_TIMEZONE',
  INVALID_PHOTO: 'INVALID_PHOTO',
  INVALID_COORDINATES: 'INVALID_COORDINATES',
  INVALID_USERNAME: 'INVALID_USERNAME',
  PASSWORD_TOO_SHORT: 'PASSWORD_TOO_SHORT',
  INVALID_BOOLEAN: 'INVALID_BOOLEAN',
  PHOTOS_REQUIRED: 'PHOTOS_REQUIRED',

  NOT_FOUND: 'NOT_FOUND',
  USER_NOT_FOUND: 'USER_NOT_FOUND',
  STREAK_NOT_FOUND: 'STREAK_NOT_FOUND',
  FRIENDSHIP_NOT_FOUND: 'FRIENDSHIP_NOT_FOUND',
  REMOTE_SELFIE_NOT_FOUND: 'REMOTE_SELFIE_NOT_FOUND',
  LEGAL_DOCUMENT_NOT_FOUND: 'LEGAL_DOCUMENT_NOT_FOUND',

  EMAIL_ALREADY_IN_USE: 'EMAIL_ALREADY_IN_USE',
  USERNAME_TAKEN: 'USERNAME_TAKEN',
  FRIENDSHIP_EXISTS: 'FRIENDSHIP_EXISTS',
  STREAK_EXISTS: 'STREAK_EXISTS',
  REMOTE_SELFIE_PENDING: 'REMOTE_SELFIE_PENDING',
  REMOTE_SELFIE_HANDLED: 'REMOTE_SELFIE_HANDLED',
  LOCATION_SHARING_DISABLED: 'LOCATION_SHARING_DISABLED',
  DUPLICATE_RECORD: 'DUPLICATE_RECORD',
  INVALID_REFERENCE: 'INVALID_REFERENCE',

  PRIVATE_PROFILE: 'PRIVATE_PROFILE',
  NOT_FRIENDS: 'NOT_FRIENDS',

  REMOTE_SELFIE_EXPIRED: 'REMOTE_SELFIE_EXPIRED',

  CANNOT_ADD_SELF: 'CANNOT_ADD_SELF',
  FACE_NOT_ENROLLED: 'FACE_NOT_ENROLLED',
  FACE_LEGACY_EMBEDDING: 'FACE_LEGACY_EMBEDDING',
  FACE_NOT_DETECTED: 'FACE_NOT_DETECTED',
  STREAK_ALREADY_MET_TODAY: 'STREAK_ALREADY_MET_TODAY',
  FRIENDSHIP_NOT_PENDING: 'FRIENDSHIP_NOT_PENDING',

  MAGIC_MEET_PHOTO_REQUIRED: 'MAGIC_MEET_PHOTO_REQUIRED',
  MAGIC_MEET_USER_NOT_ON_PHOTO: 'MAGIC_MEET_USER_NOT_ON_PHOTO',
  MAGIC_MEET_MIN_FACES: 'MAGIC_MEET_MIN_FACES',
  MAGIC_MEET_NO_MATCH: 'MAGIC_MEET_NO_MATCH',
  MAGIC_MEET_DUPLICATE_PHOTO: 'MAGIC_MEET_DUPLICATE_PHOTO',

  INTERNAL_ERROR: 'INTERNAL_ERROR',
  FACE_SERVICE_ERROR: 'FACE_SERVICE_ERROR',
  AVATAR_SAVE_FAILED: 'AVATAR_SAVE_FAILED',
  IMAGE_COMBINE_FAILED: 'IMAGE_COMBINE_FAILED',
  IMAGE_SAVE_FAILED: 'IMAGE_SAVE_FAILED',
} as const

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes]

export interface ApiErrorBody {
  error: string
  code: ErrorCode
}

const DEFAULT_MESSAGES: Record<ErrorCode, string> = {
  UNAUTHORIZED: 'Требуется авторизация',
  INVALID_TOKEN: 'Недействительный токен',
  INVALID_CREDENTIALS: 'Неверный email или пароль',
  ACCOUNT_DELETED: 'Аккаунт удалён — войдите, чтобы восстановить',
  ACCOUNT_RETENTION_EXPIRED: 'Срок восстановления истёк — аккаунт удалён навсегда',
  OAUTH_INVALID_TOKEN: 'Недействительный токен OAuth',
  OAUTH_NOT_CONFIGURED: 'OAuth не настроен на сервере',
  RESTORE_ACCOUNT_FAILED: 'Не удалось восстановить аккаунт',

  MISSING_FIELD: 'Не заполнены обязательные поля',
  INVALID_EMAIL: 'Некорректный email',
  INVALID_TIMEZONE: 'Некорректный часовой пояс',
  INVALID_PHOTO: 'Некорректный формат фото',
  INVALID_COORDINATES: 'Некорректные координаты',
  INVALID_USERNAME: 'Ник должен быть 3–20 символов: a-z, 0-9, _',
  PASSWORD_TOO_SHORT: 'Пароль должен быть не короче 6 символов',
  INVALID_BOOLEAN: 'Ожидается boolean',
  PHOTOS_REQUIRED: 'Нужно хотя бы одно фото',

  NOT_FOUND: 'Не найдено',
  USER_NOT_FOUND: 'Пользователь не найден',
  STREAK_NOT_FOUND: 'Серия не найдена',
  FRIENDSHIP_NOT_FOUND: 'Заявка в друзья не найдена',
  REMOTE_SELFIE_NOT_FOUND: 'Запрос на селфи не найден',
  LEGAL_DOCUMENT_NOT_FOUND: 'Документ не найден',

  EMAIL_ALREADY_IN_USE: 'Этот email уже занят',
  USERNAME_TAKEN: 'Этот ник уже занят',
  FRIENDSHIP_EXISTS: 'Заявка уже отправлена или вы уже друзья',
  STREAK_EXISTS: 'Серия уже существует',
  REMOTE_SELFIE_PENDING: 'Уже есть активный запрос на селфи',
  REMOTE_SELFIE_HANDLED: 'Запрос уже обработан или истёк',
  LOCATION_SHARING_DISABLED: 'Трансляция геолокации выключена',
  DUPLICATE_RECORD: 'Запись уже существует',
  INVALID_REFERENCE: 'Некорректные данные',

  PRIVATE_PROFILE: 'Профиль закрыт',
  NOT_FRIENDS: 'Сначала нужно быть друзьями',

  REMOTE_SELFIE_EXPIRED: 'Срок ответа на селфи истёк',

  CANNOT_ADD_SELF: 'Нельзя добавить себя в друзья',
  FACE_NOT_ENROLLED: 'Сначала зарегистрируй лицо в профиле',
  FACE_LEGACY_EMBEDDING: 'Перерегистрируй лицо в настройках профиля',
  FACE_NOT_DETECTED: 'Лицо не обнаружено на фото',
  STREAK_ALREADY_MET_TODAY: 'Серия уже продлена сегодня',
  FRIENDSHIP_NOT_PENDING: 'Заявка уже обработана',

  MAGIC_MEET_PHOTO_REQUIRED: 'Фото обязательно',
  MAGIC_MEET_USER_NOT_ON_PHOTO: 'Мы не нашли тебя на фото',
  MAGIC_MEET_MIN_FACES: 'На фото должно быть минимум 2 лица',
  MAGIC_MEET_NO_MATCH: 'Мы не распознали твоих друзей из активных серий на этом фото',
  MAGIC_MEET_DUPLICATE_PHOTO: 'Это фото уже было добавлено',

  INTERNAL_ERROR: 'Внутренняя ошибка сервера',
  FACE_SERVICE_ERROR: 'Ошибка распознавания лиц на сервере',
  AVATAR_SAVE_FAILED: 'Ошибка сохранения аватара',
  IMAGE_COMBINE_FAILED: 'Ошибка при объединении фото',
  IMAGE_SAVE_FAILED: 'Ошибка при сохранении фото',
}

export function apiErrorBody(
  code: ErrorCode,
  message?: string,
  extra?: Record<string, unknown>
): ApiErrorBody & Record<string, unknown> {
  return {
    error: message ?? DEFAULT_MESSAGES[code],
    code,
    ...extra,
  }
}

export function sendError(
  res: Response,
  status: number,
  code: ErrorCode,
  message?: string,
  extra?: Record<string, unknown>
): void {
  res.status(status).json(apiErrorBody(code, message, extra))
}

export function faceErrorFromException(err: unknown): { code: ErrorCode; message: string } {
  const msg = err instanceof Error ? err.message : ''
  if (msg.includes('No face') || msg.includes('не найдено')) {
    return { code: ErrorCodes.FACE_NOT_DETECTED, message: DEFAULT_MESSAGES.FACE_NOT_DETECTED }
  }
  if (msg.includes('503') || msg.includes('unhealthy')) {
    return {
      code: ErrorCodes.FACE_SERVICE_ERROR,
      message: 'Сервис распознавания лиц временно недоступен',
    }
  }
  return { code: ErrorCodes.FACE_SERVICE_ERROR, message: DEFAULT_MESSAGES.FACE_SERVICE_ERROR }
}

export function prismaErrorCode(err: unknown): { status: number; code: ErrorCode } | null {
  const prismaCode = (err as { code?: string })?.code
  if (prismaCode === 'P2002') return { status: 409, code: ErrorCodes.DUPLICATE_RECORD }
  if (prismaCode === 'P2025') return { status: 404, code: ErrorCodes.NOT_FOUND }
  if (prismaCode === 'P2003') return { status: 400, code: ErrorCodes.INVALID_REFERENCE }
  return null
}
