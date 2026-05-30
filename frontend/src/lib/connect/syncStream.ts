/**
 * Connect server-stream sync — JSON framing for sync-gateway (:8081).
 * Browser uses Connect protocol (`application/connect+json`); sync-gateway implements
 * a Connect-compatible HTTP layer (not raw tonic gRPC).
 */

import { getConnectBaseUrl, persistLastEventId, readLastEventId } from './client'
import { getAccessToken } from '../../context/AuthContext'
import type { FriendSyncPayload } from '../applySyncEvent'

export type SyncEnvelopePayload =
  | { case: 'heartbeat'; message: string }
  | { case: 'friendEvent'; value: FriendSyncPayload }
  | { case: 'unknown'; raw: unknown }

export interface SyncEnvelope {
  eventId: string
  sequence: number
  payload: SyncEnvelopePayload
}

export interface SyncStreamHandlers {
  onEnvelope: (env: SyncEnvelope) => void
  onError?: (err: unknown) => void
  onOpen?: () => void
}

const BACKOFF_MS = [1_000, 2_000, 5_000, 10_000, 30_000]

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason ?? new DOMException('Aborted', 'AbortError'))
      return
    }
    const id = window.setTimeout(resolve, ms)
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(id)
        reject(signal.reason ?? new DOMException('Aborted', 'AbortError'))
      },
      { once: true }
    )
  })
}

function parseFriendEvent(raw: Record<string, unknown>): FriendSyncPayload | null {
  const eventType =
    typeof raw.eventType === 'string'
      ? raw.eventType
      : typeof raw.event_type === 'string'
        ? raw.event_type
        : null
  const friendshipRaw = raw.friendship
  if (!eventType || !friendshipRaw || typeof friendshipRaw !== 'object') return null

  const f = friendshipRaw as Record<string, unknown>
  const friendRaw = f.friend
  if (!friendRaw || typeof friendRaw !== 'object') return null
  const friend = friendRaw as Record<string, unknown>

  const id = typeof f.id === 'string' ? f.id : ''
  const status = typeof f.status === 'string' ? f.status : 'PENDING'
  const isIncomingRequest =
    typeof f.isIncomingRequest === 'boolean'
      ? f.isIncomingRequest
      : typeof f.is_incoming_request === 'boolean'
        ? f.is_incoming_request
        : false

  if (!id || typeof friend.id !== 'string' || typeof friend.nickname !== 'string') return null

  return {
    eventType,
    friendship: {
      id,
      status: status as FriendSyncPayload['friendship']['status'],
      isIncomingRequest,
      friend: {
        id: friend.id,
        nickname: friend.nickname,
        avatarUrl:
          typeof friend.avatarUrl === 'string'
            ? friend.avatarUrl
            : typeof friend.avatar_url === 'string'
              ? friend.avatar_url
              : null,
      },
    },
  }
}

/** Parse Connect JSON SyncEnvelope lines from sync-gateway. */
function parseEnvelope(raw: unknown): SyncEnvelope | null {
  if (!raw || typeof raw !== 'object') return null
  const obj = raw as Record<string, unknown>
  const eventId =
    typeof obj.eventId === 'string'
      ? obj.eventId
      : typeof obj.event_id === 'string'
        ? obj.event_id
        : ''
  const sequence = typeof obj.sequence === 'number' ? obj.sequence : 0

  const friendEventRaw = obj.friendEvent ?? obj.friend_event
  if (friendEventRaw && typeof friendEventRaw === 'object') {
    const parsed = parseFriendEvent(friendEventRaw as Record<string, unknown>)
    if (parsed) {
      return { eventId, sequence, payload: { case: 'friendEvent', value: parsed } }
    }
  }

  const heartbeat = obj.heartbeat
  if (heartbeat && typeof heartbeat === 'object') {
    const hb = heartbeat as Record<string, unknown>
    if (typeof hb.message === 'string') {
      return {
        eventId,
        sequence,
        payload: { case: 'heartbeat', message: hb.message },
      }
    }
  }

  return { eventId, sequence, payload: { case: 'unknown', raw } }
}

async function readConnectJsonStream(
  response: Response,
  handlers: SyncStreamHandlers,
  signal: AbortSignal
): Promise<void> {
  if (!response.body) throw new Error('sync stream: empty body')

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (!signal.aborted) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    let newline = buffer.indexOf('\n')
    while (newline >= 0) {
      const line = buffer.slice(0, newline).trim()
      buffer = buffer.slice(newline + 1)
      if (line) {
        try {
          const parsed = parseEnvelope(JSON.parse(line))
          if (parsed) {
            if (parsed.eventId) persistLastEventId(parsed.eventId)
            handlers.onEnvelope(parsed)
          }
        } catch {
          // ignore partial / non-json frames
        }
      }
      newline = buffer.indexOf('\n')
    }
  }
}

async function openSubscribeOnce(handlers: SyncStreamHandlers, signal: AbortSignal): Promise<void> {
  const token = getAccessToken()
  if (!token) throw new Error('sync stream: missing access token')

  const url = `${getConnectBaseUrl()}/streakmeet.v1.SyncService/Subscribe`
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/connect+json',
      'Connect-Protocol-Version': '1',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ lastEventId: readLastEventId() }),
    signal,
  })

  if (!response.ok) {
    throw new Error(`sync stream: HTTP ${response.status}`)
  }

  handlers.onOpen?.()
  await readConnectJsonStream(response, handlers, signal)
}

/** Connect with exponential backoff until aborted. */
export async function runSyncStream(
  handlers: SyncStreamHandlers,
  signal: AbortSignal
): Promise<void> {
  let attempt = 0
  while (!signal.aborted) {
    try {
      await openSubscribeOnce(handlers, signal)
      attempt = 0
    } catch (err) {
      if (signal.aborted) return
      handlers.onError?.(err)
      const delay = BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length - 1)]!
      attempt += 1
      try {
        await sleep(delay, signal)
      } catch {
        return
      }
    }
  }
}
