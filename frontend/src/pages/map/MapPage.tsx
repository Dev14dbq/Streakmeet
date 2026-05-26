import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { Geolocation } from '@capacitor/geolocation'
import { io, type Socket } from 'socket.io-client'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { Link } from 'react-router-dom'
import { MapPin, Radio, Smartphone, Users, X } from 'lucide-react'
import { getFriendLocations, getMyLocation, type FriendLocation } from '../../lib/api'
import {
  isLocationSharingActive,
  startLocationSharing,
  stopLocationSharing,
} from '../../lib/locationSharing'
import { toastError } from '../../lib/toast'

const API_BASE = import.meta.env.VITE_API_URL || ''
const TILE_URL = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>'

function formatUpdatedAt(iso: string): string {
  const diffSec = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000))
  if (diffSec < 15) return 'только что'
  if (diffSec < 60) return `${diffSec} сек назад`
  const min = Math.floor(diffSec / 60)
  if (min < 60) return `${min} мин назад`
  const h = Math.floor(min / 60)
  return `${h} ч назад`
}

function friendMarkerHtml(friend: FriendLocation, selected: boolean): string {
  const avatar = friend.avatarUrl
    ? `<img src="${API_BASE}${friend.avatarUrl}" alt="" />`
    : `<span>${friend.nickname.slice(0, 1).toUpperCase()}</span>`
  return `
    <div class="map-friend-marker ${selected ? 'map-friend-marker--selected' : ''}">
      <div class="map-friend-marker__ring"></div>
      <div class="map-friend-marker__avatar">${avatar}</div>
    </div>
  `
}

function selfMarkerHtml(): string {
  return `
    <div class="map-self-marker">
      <div class="map-self-marker__pulse"></div>
      <div class="map-self-marker__dot"></div>
    </div>
  `
}

function NativeAppGate() {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center px-8 pb-28 text-center">
      <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-[var(--color-surface-container-high)]">
        <Smartphone size={36} className="text-[var(--color-brand-primary)]" />
      </div>
      <h2 className="mb-2 text-xl font-bold text-white">Карта — только в приложении</h2>
      <p className="max-w-xs text-sm leading-relaxed text-[var(--color-on-surface-variant)]">
        Живая геолокация друзей и фоновая трансляция доступны в мобильном приложении StreakMeet.
      </p>
    </div>
  )
}

export default function MapPage() {
  const isNative = Capacitor.isNativePlatform()
  const mapElRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const markersRef = useRef<Map<string, L.Marker>>(new Map())
  const selfMarkerRef = useRef<L.Marker | null>(null)

  const [friends, setFriends] = useState<FriendLocation[]>([])
  const [sharing, setSharing] = useState(false)
  const [sharingBusy, setSharingBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<FriendLocation | null>(null)
  const [selfPos, setSelfPos] = useState<{ lat: number; lng: number } | null>(null)

  const onlineCount = useMemo(
    () => friends.filter((f) => Date.now() - new Date(f.updatedAt).getTime() < 5 * 60_000).length,
    [friends]
  )

  const upsertFriend = useCallback((friend: FriendLocation) => {
    setFriends((prev) => {
      const idx = prev.findIndex((f) => f.id === friend.id)
      if (idx === -1) return [...prev, friend].sort((a, b) => a.nickname.localeCompare(b.nickname))
      const next = [...prev]
      next[idx] = friend
      return next
    })
    setSelected((cur) => (cur?.id === friend.id ? friend : cur))
  }, [])

  const removeFriend = useCallback((friendId: string) => {
    setFriends((prev) => prev.filter((f) => f.id !== friendId))
    setSelected((cur) => (cur?.id === friendId ? null : cur))
  }, [])

  useEffect(() => {
    if (!isNative) return

    let cancelled = false
    ;(async () => {
      try {
        const [{ data: me }, { data: list }] = await Promise.all([
          getMyLocation(),
          getFriendLocations(),
        ])
        if (cancelled) return
        setSharing(me.sharingLocation || isLocationSharingActive())
        setFriends(list)
        if (me.latitude != null && me.longitude != null) {
          setSelfPos({ lat: me.latitude, lng: me.longitude })
        }
      } catch {
        if (!cancelled) toastError('Не удалось загрузить карту')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [isNative])

  useEffect(() => {
    if (!isNative) return

    const token = localStorage.getItem('accessToken')
    if (!token) return

    const socket: Socket = io(window.location.origin, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 5,
    })

    socket.on('friend:location', (payload: FriendLocation) => {
      if (payload?.id) upsertFriend(payload)
    })
    socket.on('friend:location:off', (payload: { id?: string }) => {
      if (payload?.id) removeFriend(payload.id)
    })

    return () => {
      socket.disconnect()
    }
  }, [isNative, upsertFriend, removeFriend])

  useEffect(() => {
    if (!isNative || !mapElRef.current || mapRef.current) return

    const map = L.map(mapElRef.current, {
      zoomControl: false,
      attributionControl: true,
    }).setView([55.751, 37.618], 12)

    L.tileLayer(TILE_URL, {
      attribution: TILE_ATTRIBUTION,
      subdomains: 'abcd',
      maxZoom: 20,
    }).addTo(map)

    L.control.zoom({ position: 'bottomright' }).addTo(map)
    mapRef.current = map

    void Geolocation.getCurrentPosition({
      enableHighAccuracy: true,
      timeout: 12_000,
      maximumAge: 0,
    })
      .then((pos) => {
        const lat = pos.coords.latitude
        const lng = pos.coords.longitude
        setSelfPos({ lat, lng })
        map.setView([lat, lng], 14, { animate: false })
      })
      .catch(() => {})

    return () => {
      map.remove()
      mapRef.current = null
      markersRef.current.clear()
      selfMarkerRef.current = null
    }
  }, [isNative])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    for (const friend of friends) {
      const icon = L.divIcon({
        className: 'map-marker-wrap',
        html: friendMarkerHtml(friend, selected?.id === friend.id),
        iconSize: [52, 52],
        iconAnchor: [26, 26],
      })

      const existing = markersRef.current.get(friend.id)
      if (existing) {
        existing.setLatLng([friend.latitude, friend.longitude])
        existing.setIcon(icon)
      } else {
        const marker = L.marker([friend.latitude, friend.longitude], { icon })
        marker.on('click', () => setSelected(friend))
        marker.addTo(map)
        markersRef.current.set(friend.id, marker)
      }
    }

    for (const [id, marker] of markersRef.current) {
      if (!friends.some((f) => f.id === id)) {
        marker.remove()
        markersRef.current.delete(id)
      }
    }
  }, [friends, selected])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !selfPos) return

    const icon = L.divIcon({
      className: 'map-marker-wrap',
      html: selfMarkerHtml(),
      iconSize: [28, 28],
      iconAnchor: [14, 14],
    })

    if (selfMarkerRef.current) {
      selfMarkerRef.current.setLatLng([selfPos.lat, selfPos.lng])
    } else {
      selfMarkerRef.current = L.marker([selfPos.lat, selfPos.lng], { icon, zIndexOffset: 1000 })
      selfMarkerRef.current.addTo(map)
    }
  }, [selfPos])

  useEffect(() => {
    if (!selected || !mapRef.current) return
    mapRef.current.flyTo([selected.latitude, selected.longitude], 15, { duration: 0.8 })
  }, [selected])

  async function toggleSharing() {
    if (sharingBusy) return
    setSharingBusy(true)
    try {
      if (sharing) {
        await stopLocationSharing()
        setSharing(false)
      } else {
        await startLocationSharing()
        setSharing(true)
        const pos = await Geolocation.getCurrentPosition({
          enableHighAccuracy: true,
          timeout: 12_000,
          maximumAge: 0,
        })
        setSelfPos({ lat: pos.coords.latitude, lng: pos.coords.longitude })
        mapRef.current?.setView([pos.coords.latitude, pos.coords.longitude], 15)
      }
    } catch (e) {
      if ((e as Error).message === 'permission_denied') {
        toastError('Нужен доступ к геолокации')
      } else {
        toastError('Не удалось переключить трансляцию')
      }
    } finally {
      setSharingBusy(false)
    }
  }

  if (!isNative) return <NativeAppGate />

  return (
    <div className="relative h-[calc(100dvh-5.5rem)] min-h-[420px] w-full overflow-hidden">
      <div ref={mapElRef} className="absolute inset-0 z-0 streak-map" />

      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 bg-gradient-to-b from-black/85 via-black/35 to-transparent px-5 pb-10 pt-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--color-brand-primary)]">
              Live map
            </p>
            <h1 className="text-2xl font-black text-white">Карта друзей</h1>
            <p className="mt-1 text-xs text-[var(--color-on-surface-variant)]">
              {loading
                ? 'Загрузка…'
                : friends.length === 0
                  ? 'Пока никто не транслирует'
                  : `${friends.length} на карте · ${onlineCount} онлайн`}
            </p>
          </div>
          <div className="glass-card pointer-events-auto flex items-center gap-2 rounded-full px-3 py-2 text-xs font-semibold text-white">
            <Users size={14} className="text-[var(--color-brand-primary)]" />
            {friends.length}
          </div>
        </div>
      </div>

      {selected && (
        <div className="absolute inset-x-4 top-28 z-20">
          <div className="glass-card flex items-center gap-3 rounded-[24px] border border-white/10 px-4 py-3 shadow-[0_20px_50px_rgba(0,0,0,0.45)]">
            <div className="h-12 w-12 overflow-hidden rounded-full bg-[var(--color-surface-container-high)]">
              {selected.avatarUrl ? (
                <img
                  src={API_BASE + selected.avatarUrl}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-lg">👤</div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate font-bold text-white">@{selected.nickname}</p>
              <p className="text-xs text-[var(--color-on-surface-variant)]">
                {formatUpdatedAt(selected.updatedAt)}
              </p>
            </div>
            <Link
              to={`/${selected.nickname}`}
              className="rounded-full bg-white/10 px-3 py-2 text-xs font-semibold text-white"
            >
              Профиль
            </Link>
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="rounded-full p-2 text-[var(--color-on-surface-variant)]"
              aria-label="Закрыть"
            >
              <X size={16} />
            </button>
          </div>
        </div>
      )}

      <div className="absolute inset-x-0 bottom-4 z-20 flex justify-center px-4">
        <div className="glass-card w-full max-w-md rounded-[28px] border border-white/10 p-4 shadow-[0_20px_60px_rgba(0,0,0,0.55)]">
          <div className="mb-3 flex items-center gap-2 text-xs text-[var(--color-on-surface-variant)]">
            <MapPin size={14} className="text-[var(--color-brand-primary)]" />
            Точная геолокация · фоновая трансляция, пока не выключишь
          </div>
          <button
            type="button"
            disabled={sharingBusy}
            onClick={toggleSharing}
            className={`flex w-full items-center justify-center gap-2 rounded-full py-4 text-base font-black transition active:scale-[0.98] disabled:opacity-60 ${
              sharing
                ? 'bg-white/10 text-white ring-2 ring-[var(--color-brand-primary)]'
                : 'bg-[var(--color-brand-primary)] text-white shadow-[0_12px_36px_rgba(255,26,79,0.45)]'
            }`}
          >
            <Radio
              size={20}
              className={sharing ? 'animate-pulse text-[var(--color-brand-primary)]' : ''}
            />
            {sharingBusy ? '…' : sharing ? 'Остановить трансляцию' : 'Транслировать геолокацию'}
          </button>
          {!sharing && (
            <p className="mt-2 text-center text-[11px] text-[var(--color-on-surface-variant)]">
              Можно смотреть друзей без своей трансляции
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
