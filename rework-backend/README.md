# Rework Backend — StreakMeet

Документы по перепроектированию backend: **Rust**, **микросервисы**, **realtime-first** (WebSocket + надёжная доставка событий).

| Файл                                                           | Содержание                                                  |
| -------------------------------------------------------------- | ----------------------------------------------------------- |
| [01-architecture.md](./01-architecture.md)                     | Микросервисы, стек, коммуникация между сервисами, инфра     |
| [02-migration-and-realtime.md](./02-migration-and-realtime.md) | Протокол realtime, какие запросы куда, фазы миграции, риски |

## Зафиксированные решения

| Вопрос            | Ответ                                     |
| ----------------- | ----------------------------------------- |
| Realtime протокол | **gRPC streaming** (Connect-RPC / HTTP/2) |
| HTTP              | **Гибрид:** unary команды + stream sync   |
| Деплой            | **1 dev, 1 VPS**, docker-compose          |
| Face ML           | **Python** микросервис без изменений      |

Оставшиеся пункты — в секции «Открытые вопросы» в каждом документе.

## Связь с текущим кодом

- Текущий monolith: `backend/` (Express + Prisma + Socket.IO)
- Контракт API: `packages/api-spec/`
- Face ML: `face-service/` (Python)
- Frontend realtime: `frontend/src/hooks/useRealtimeSocket.ts`, `useSocket.ts`
