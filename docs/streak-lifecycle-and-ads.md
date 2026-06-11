# Смерть серии, восстановление рекламой, AdMob

## План (реализовано)

1. **Убрать гемы** — бейдж на главной удалён; начисление за meet отключено (Rust + Node).
2. **Статусы серии** — `ACTIVE` | `DEAD` | `DEAD_FINAL` в БД и API.
3. **Сгорание** — воркер в 00:05 (локально): `DEAD` + сохранение `countAtDeath`, или `DEAD_FINAL` если в месяце уже 3 восстановления.
4. **Восстановление** — `POST /api/streaks/:nickname/restore` после rewarded video (до 3 раз в календарный месяц на пару).
5. **Окончательная смерть** — галерея фото остаётся; `POST /api/streaks/:nickname/restart` обнуляет счётчик.
6. **AdMob** — Android App ID и Rewarded unit из кабинета; плагин `@capgo/capacitor-admob`.

## Твои ID (Android)

| Назначение                             | ID                                       |
| -------------------------------------- | ---------------------------------------- |
| App ID                                 | `ca-app-pub-7075459475007291~7456700640` |
| Rewarded (восстановление серии)        | `ca-app-pub-7075459475007291/798653455`  |
| Interstitial (после фото, до проверки) | `ca-app-pub-7075459475007291/3089549995` |

Прописаны в `frontend/.env.example`, `AndroidManifest.xml`, `frontend/src/lib/rewardedAd.ts`, `frontend/src/lib/interstitialAd.ts`.

Interstitial показывается в `GlobalCamera` (meet + remote) и в `StreakDetailsPage` (remote selfie) **после снимка, до** `magic-meet` / upload API.

## Миграция БД

```bash
psql "$DATABASE_URL" -f backend-rust/migrations/003_streak_lifecycle.sql
```

Либо автоматически при старте `api-gateway` (`ensure_streak_lifecycle_schema`).

## Сборка нативного Android

```bash
cd frontend
# Node >= 22 для cap CLI
npx cap sync android
npm run build && npx cap copy android
```

## iOS

Создай приложение и rewarded unit в AdMob, добавь в `.env`:

- `VITE_ADMOB_APP_ID_IOS`
- `VITE_ADMOB_REWARDED_IOS`

## Дальше (не сделано)

- Server-Side Verification (SSV) AdMob на `restore` — сейчас доверие клиенту + лимит 3/мес на сервере.
- Удаление `gemsBalance` / `gem_transactions` из схемы отдельной миграцией.
