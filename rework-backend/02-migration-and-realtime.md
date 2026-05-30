# 02 — Миграция и Realtime: протокол, события, фазы

> **Зафиксированные решения**
>
> - **Connect/gRPC streaming** для live sync (вместо Socket.IO)
> - **Гибрид:** команды через unary REST/Connect, состояние через stream + CatchUp
> - **1 VPS**, docker-compose
> - Face: Python как есть

---

## 1. Модель взаимодействия кли ↔ backend

```
┌──────────── Client ────────────┐
│ 1. Login (unary REST/Connect)  │──▶ JWT
│ 2. Initial load (unary batch)  │──▶ GetMe, ListFriends, ListStreaks, ...
│ 3. SubscribeSync (stream)      │──▶ постоянный server-stream
│ 4. Commands (unary)            │──▶ CreateStreak, AcceptFriend, ...
│ 5. On disconnect → CatchUp     │──▶ с last_event_id
└────────────────────────────────┘
```

### Почему не «всё в stream»

| Операция                     | Канал                         | Причина                                      |
| ---------------------------- | ----------------------------- | -------------------------------------------- |
| Login, register              | unary                         | Нет token → нет stream; стандарт OAuth flows |
| Upload фото (1–5 MB base64)  | REST multipart / S3 presigned | Stream не для bulk binary                    |
| Accept friend, create streak | unary                         | Request/response, ошибки, idempotency keys   |
| Friend request появился у B  | **stream**                    | Push-модель                                  |
| Streak count изменился       | **stream**                    | Push-модель                                  |
| Location off у друга         | **stream**                    | Push-модель                                  |
| Streak burned (cron)         | **stream**                    | Оба получают без polling                     |

---

## 2. Надёжность: gRPC stream vs WebSocket

### 2.1 Слои надёжности

```
Layer 4: Client UI patch (SWR/Zustand apply payload)
Layer 3: CatchUp RPC после reconnect (gap fill)
Layer 2: NATS JetStream (persist + redelivery to sync-gateway)
Layer 1: Outbox in PostgreSQL (не потерять при publish fail)
Layer 0: Idempotent unary commands (повтор запроса безопасен)
```

### 2.2 Поведение при обрыве

1. Client детектит stream closed / deadline exceeded.
2. Exponential backoff reconnect (1s → 2s → … → 30s cap).
3. `CatchUp(last_event_id)` — догоняет пропущенное.
4. Parallel: unary refresh критичных ключей (`ListStreaks`) если gap > N минут.

### 2.3 Ack (опционально, фаза 2)

`Ack(event_id)` — для analytics и tuning redelivery. **Не блокирует** UI: patch сразу по получению.

### 2.4 Fallback для проблемных сетей

| Сценарий                                | Fallback                                                             |
| --------------------------------------- | -------------------------------------------------------------------- |
| gRPC stream не поднимается (corp proxy) | Connect **SSE** mode (`connect-es` supports SSE for server-stream)   |
| Полный offline                          | Local cache + CatchUp при online                                     |
| Background mobile                       | FCM data push → будит app → CatchUp (не держим вечный stream в фоне) |

---

## 3. Матрица доменных событий (SyncEnvelope)

Каждое событие публикуется в NATS subject `sync.user.{recipientUserId}`.

### 3.1 Друзья (`social-service`)

| Событие                 | Триггер                   | Получатели     | Payload                             |
| ----------------------- | ------------------------- | -------------- | ----------------------------------- |
| `friends.requested`     | POST request              | **A и B**      | `{ friendship: FriendListItem }`    |
| `friends.accepted`      | POST accept               | **A и B**      | `{ friendship: FriendListItem }`    |
| `friends.rejected`      | POST reject _(новый)_     | **A и B**      | `{ friendshipId, removed: true }`   |
| `friends.cancelled`     | POST cancel _(новый)_     | **A и B**      | `{ friendshipId, removed: true }`   |
| `friends.removed`       | DELETE unfriend _(новый)_ | **оба**        | `{ friendshipId, removed: true }`   |
| `users.profile_updated` | avatar/nickname           | **все друзья** | `{ userId, nickname?, avatarUrl? }` |

**Сценарий «принял заявку — у другого сразу»:**  
`friends.accepted` → обоим `FriendListItem` со `status: ACCEPTED`; клиент патчит cache без refetch.

### 3.2 Серии (`streaks-service`)

| Событие                         | Триггер             | Получатели              | Payload                                          |
| ------------------------------- | ------------------- | ----------------------- | ------------------------------------------------ |
| `streaks.created`               | POST create streak  | **инициатор + партнёр** | `{ streak: StreakListItem }`                     |
| `streaks.meet_extended`         | meet / magic meet   | **оба**                 | `{ streakId, count, lastMetDate, partner }`      |
| `streaks.photo_added`           | второе фото за день | **оба**                 | `{ streakId, streakDayId, photoUrl }`            |
| `streaks.burned`                | worker cron         | **оба**                 | `{ streakId, count: 0 }`                         |
| `streaks.remote_selfie_pending` | init remote selfie  | **receiver**            | `{ streakId, pendingRemoteSelfie }`              |
| `streaks.remote_selfie_cleared` | reply / expire      | **оба**                 | `{ streakId, pendingRemoteSelfie: null, meet? }` |
| `streaks.remind`                | remind unary        | **partner**             | notification-only или lightweight sync           |

**Сценарий «начал серию — у другого появилась»:**  
`streaks.created` партнёру с полным `StreakListItem`.

### 3.3 Локация (`location-service`)

| Событие                | Триггер           | Получатели | Payload                                            |
| ---------------------- | ----------------- | ---------- | -------------------------------------------------- |
| `location.updated`     | coordinate update | **друзья** | `{ id, lat, lng, updatedAt, nickname, avatarUrl }` |
| `location.sharing_on`  | enable sharing    | **друзья** | same as updated                                    |
| `location.sharing_off` | disable sharing   | **друзья** | `{ id, removed: true }`                            |

**Сценарий «выключил трансляцию»:**  
`location.sharing_off` → у друзей маркер удаляется из map state / cache.

### 3.4 Gems / memories (фаза 2+)

| Событие              | Получатели |
| -------------------- | ---------- |
| `gems.updated`       | self       |
| `memories.milestone` | оба в паре |

### 3.5 Notifications (toast, не обязательно менять UI state)

Отдельный oneof в `SyncEnvelope` или filter на клиенте:

```protobuf
message Notification {
  string type = 1;  // friend_request, meet_extended, streak_1h, ...
  map<string, string> params = 2;
  string route = 3;
}
```

Уважать prefs: `notifyFriends`, `notifyMeet`.

---

## 4. Unary API (замена REST — mapping)

Сохраняем **те же URL** на переходный период через gateway proxy; целевой контракт — protobuf.

| Текущий REST                   | Connect RPC                   | Сервис                 |
| ------------------------------ | ----------------------------- | ---------------------- |
| `POST /api/auth/login`         | `AuthService.Login`           | auth                   |
| `POST /api/friends/request`    | `SocialService.RequestFriend` | social                 |
| `POST /api/friends/accept`     | `SocialService.AcceptFriend`  | social                 |
| `POST /api/streaks`            | `StreaksService.CreateStreak` | streaks                |
| `POST /api/streaks/magic-meet` | `StreaksService.MagicMeet`    | streaks + media + face |
| `POST /api/location/update`    | `LocationService.Update`      | location               |
| `GET /api/streaks`             | `StreaksService.ListStreaks`  | streaks                |
| —                              | `SyncService.Subscribe`       | sync-gateway           |
| —                              | `SyncService.CatchUp`         | sync-gateway           |

### Idempotency

Для unary мутаций клиент шлёт заголовок / metadata:

```
Idempotency-Key: <uuid>
```

Gateway / сервис хранит результат 24h в Redis — повтор не дублирует side effects.

---

## 5. Frontend rework (кратко)

### 5.1 Удалить / заменить

| Сейчас                        | Станет                                                           |
| ----------------------------- | ---------------------------------------------------------------- |
| `socket.io-client`            | `@connectrpc/connect-web` (+ native Connect на Capacitor)        |
| `useRealtimeSocket`           | `useSyncStream` — один stream, router по `SyncEnvelope`          |
| `useSocket` на MapPage        | location events из общего stream                                 |
| `invalidateAfterNotification` | `applySyncEvent(type, payload)` + optional background revalidate |

### 5.2 Client state flow

```typescript
// pseudo
stream.on('SyncEnvelope', (env) => {
  switch (env.payload.case) {
    case 'friends':
      patchFriendsCache(env.payload.value)
      break
    case 'streakCreated':
      insertStreak(env.payload.value.streak)
      break
    case 'locationRemoved':
      removeFriendLocation(env.payload.value.id)
      break
    case 'notification':
      showToast(env.payload.value)
      break
  }
  lastEventId = env.eventId
  persistLastEventId(lastEventId)
})
```

### 5.3 `@streakmeet/api-spec`

- Фаза перехода: TypeSpec остаётся для REST shim.
- Целевое: **Buf** `proto/` — source of truth; генерация TS (`connect-es`) + Rust (`tonic`).

---

## 6. Фазы миграции

### Фаза 0 — Foundation (1–2 недели)

- [ ] `proto/` — `SyncService`, `AuthService`, базовые messages
- [ ] docker-compose.rework: NATS, Redis, все Rust binaries (skeleton)
- [ ] SQLx + migrations copy from Prisma
- [ ] `streakmeet-types`: все `ErrorCodes` 1:1 с Node
- [ ] auth-service: JWT login (parity с Node)
- [ ] sync-gateway: echo stream для dev

**Критерий:** mobile/web подключается к stream, получает ping events.

### Фаза 1 — Sync + Friends (1–2 недели)

- [ ] social-service: request/accept + outbox + NATS publish
- [ ] sync-gateway: fan-out `friends.*`
- [ ] Frontend: `useSyncStream` + patch friends cache
- [ ] Новые RPC: reject, cancel, unfriend
- [ ] Node proxy или nginx split для `/api/friends` → Rust

**Критерий:** два браузера — request/accept без refetch.

### Фаза 2 — Streaks + Worker (2–3 недели)

- [ ] streaks-service: create, list, detail, meet, magic meet
- [ ] media-service: AVIF + photo hash parity tests vs sharp
- [ ] worker: streak burn → `streaks.burned` sync
- [ ] remote selfie flow + sync events
- [ ] Frontend: HomePage + StreakDetails patch

**Критерий:** create streak у A → карточка у B; burn sync у обоих.

### Фаза 3 — Location + Users (1 неделя)

- [ ] location-service + sync events
- [ ] users-service: profile, avatar (presigned upload)
- [ ] Global map state из stream (убрать отдельный socket на MapPage)

### Фаза 4 — Auth complete + cutover (1–2 недели)

- [ ] OAuth Google/Apple
- [ ] Email verify, password reset (Resend)
- [ ] Face enroll orchestration
- [ ] memories, legal, public profiles
- [ ] Contract tests: Node vs Rust (где Node ещё жив)
- [ ] Выключить Node `backend/`, PM2 → Rust compose

### Фаза 5 — Hardening (ongoing)

- [ ] FCM background wake → CatchUp
- [ ] JetStream retention tuning
- [ ] SSE fallback для web
- [ ] Split `streakmeet-core` на отдельные процессы при необходимости

**Оценка solo:** 7–10 недель до полного cutover.

---

## 7. Переходный период (Node + Rust)

```
nginx
  /api/friends/*     → rust-gateway (when ready)
  /api/streaks/*     → node (until phase 2)
  /connect/*         → rust sync-gateway
  /socket.io/*       → node (deprecated, remove after frontend migrate)
```

**JWT один секрет** — оба backend принимают один token на время миграции.

**БД одна** — Rust пишет в те же таблицы; outbox — новая таблица.

---

## 8. Тестирование

### 8.1 Contract parity

| Тест               | Описание                                                          |
| ------------------ | ----------------------------------------------------------------- |
| Unary parity       | Same request → Node JSON == Rust JSON                             |
| Stream integration | Command → event on other client's stream within 500ms             |
| CatchUp            | Disconnect 30s → reconnect → no missing events                    |
| Burn cron          | Fake TZ streak → worker fires → both clients get `streaks.burned` |
| Idempotency        | Double AcceptFriend → one side effect                             |

### 8.2 Load (один VPS)

- 500 concurrent streams — realistic max для старта
- NATS memory limit в compose
- Profile media/ magic meet separately (CPU bound)

---

## 9. docker-compose.rework.yml (sketch)

```yaml
services:
  nats:
    image: nats:2-alpine
    command: ['-js', '-m', '8222']

  redis:
    image: redis:7-alpine

  db:
    image: postgres:15-alpine
    # ...

  minio:
    # ...

  face-service:
    # existing Python

  gateway:
    build: ./services/api-gateway
    ports: ['8080:8080']
    depends_on: [nats, redis, db]

  sync-gateway:
    build: ./services/sync-gateway
    ports: ['8081:8081']
    depends_on: [nats, redis]

  core:
    build: ./services/streakmeet-core # combined binaries
    depends_on: [db, nats, face-service]

  media:
    build: ./services/media-service
    depends_on: [minio]

  worker:
    build: ./services/worker-service
    depends_on: [db, nats]
```

---

## 10. Риски и митигации

| Риск                                    | Митигация                                          |
| --------------------------------------- | -------------------------------------------------- |
| Solo + microservices = DevOps overload  | 4 контейнера на старте; workspace crates           |
| gRPC в browser / старые Android WebView | Connect + SSE fallback; Capacitor native Connect   |
| Дубли событий                           | `event_id` dedup на клиенте                        |
| NATS down                               | Outbox retry; unary refresh fallback               |
| AVIF hash mismatch vs Node              | Golden tests на sample images                      |
| Долгая миграция frontend                | REST shim на gateway, stream параллельно socket.io |

---

## 11. Чеклист «готовы выключить Socket.IO»

- [ ] Frontend не импортирует `socket.io-client`
- [ ] Все события из матрицы §3 покрыты
- [ ] CatchUp работает на iOS/Android background cycle
- [ ] nginx HTTP/2 для `/connect/`
- [ ] Node backend stopped in PM2
- [ ] Rollback doc: nginx → Node за 5 минут

---

## 12. Открытые вопросы

- [ ] Capacitor: `@connectrpc/connect` native vs webview-only?
- [ ] Idempotency-Key: только на gateway или в каждом сервисе?
- [ ] SSE fallback — с первого дня или после MVP stream?
- [ ] Сохранять ли REST paths навсегда (compat) или breaking v2?

---

## Связанные документы

- [01-architecture.md](./01-architecture.md) — сервисы, NATS, outbox, nginx
- [README.md](./README.md)
