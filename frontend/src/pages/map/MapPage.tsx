import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Capacitor } from '@capacitor/core'
import { Geolocation } from '@capacitor/geolocation'
import { type Socket } from 'socket.io-client'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { Link } from 'react-router-dom'
import CachedImage from '../../components/CachedImage'
import { Locate, MapPin, Navigation, Radio, Smartphone, Users, X } from 'lucide-react'
import {
  getFriendLocations,
  getMyLocation,
  getApiErrorMessage,
  type FriendLocation,
} from '../../lib/api'
import { useSocket } from '../../hooks/useSocket'
import {
  isLocationSharingActive,
  startLocationSharing,
  stopLocationSharing,
} from '../../lib/locationSharing'
import {
  checkAlwaysLocationPermission,
  openAlwaysLocationSettings,
} from '../../lib/alwaysLocationPermission'
import {
  distanceMeters,
  formatCoords,
  formatDistance,
  openNavigationRoute,
  reverseGeocode,
} from '../../lib/mapGeo'
import { resolveBackendImageUrl } from '../../lib/remoteImageUrl'
import { useCachedImageSrcMap } from '../../lib/useCachedImageSrc'
import { formatRelativeTime } from '../../i18n/format'
import { toastError } from '../../lib/toast'
import { MAP_TILE_URLS, useResolvedTheme } from '../../lib/theme'
import { useAuth } from '../../context/AuthContext'

const SHARE_UI_COMPACT_KEY = 'map_share_ui_compact'
const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>'

function avatarDisplaySrc(
  url: string | null | undefined,
  cached: Record<string, string>
): string | null {
  if (!url) return null
  return cached[url] ?? resolveBackendImageUrl(url)
}

function userMarkerHtml(opts: {
  nickname: string
  src: string | null
  variant: 'self' | 'friend'
  selected?: boolean
}): string {
  const initial = opts.nickname.slice(0, 1).toUpperCase() || '?'
  const avatar = opts.src
    ? `<img src="${opts.src}" alt="" loading="lazy" />`
    : `<span>${initial}</span>`
  const classes = [
    'map-user-marker',
    opts.variant === 'self' ? 'map-user-marker--self' : 'map-user-marker--friend',
    opts.selected ? 'map-user-marker--selected' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return `
    <div class="${classes}">
      ${opts.variant === 'self' ? '<div class="map-user-marker__pulse"></div>' : ''}
      <div class="map-user-marker__ring"></div>
      <div class="map-user-marker__avatar">${avatar}</div>
    </div>
  `
}

function NativeAppGate() {
  const { t } = useTranslation()

  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center px-8 pb-28 text-center">
      <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-[var(--color-surface-container-high)]">
        <Smartphone size={36} className="text-[var(--color-brand-primary)]" />
      </div>
      <h2 className="mb-2 text-xl font-bold text-on-surface">{t('mobileGate.title')}</h2>
      <p className="max-w-xs text-sm leading-relaxed text-[var(--color-on-surface-variant)]">
        {t('mobileGate.description')}
      </p>
    </div>
  )
}

export default function MapPage() {
  const { t } = useTranslation()
  const isNative = Capacitor.isNativePlatform()
  const resolvedTheme = useResolvedTheme()
  const mapElRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const tileLayerRef = useRef<L.TileLayer | null>(null)
  const markersRef = useRef<Map<string, L.Marker>>(new Map())
  const selfMarkerRef = useRef<L.Marker | null>(null)

  const [friends, setFriends] = useState<FriendLocation[]>([])
  const [sharing, setSharing] = useState(false)
  const [sharingBusy, setSharingBusy] = useState(false)
  const [shareExplainOpen, setShareExplainOpen] = useState(false)
  const [compactShareUi, setCompactShareUi] = useState(
    () => localStorage.getItem(SHARE_UI_COMPACT_KEY) === '1'
  )
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<FriendLocation | null>(null)
  const [selectedAddress, setSelectedAddress] = useState<string | null>(null)
  const [addressLoading, setAddressLoading] = useState(false)
  const [selfPos, setSelfPos] = useState<{ lat: number; lng: number } | null>(null)
  const [locating, setLocating] = useState(false)

  const { user: me } = useAuth()
  if (!me) return null

  const markerSize = 40
  const markerAnchor = markerSize / 2

  const onlineCount = useMemo(
    () => friends.filter((f) => Date.now() - new Date(f.updatedAt).getTime() < 5 * 60_000).length,
    [friends]
  )

  const broadcastingCount = friends.length + (sharing ? 1 : 0)
  const onlineOnMap = onlineCount + (sharing ? 1 : 0)

  const mapStatusText = loading
    ? t('map.loading')
    : friends.length === 0 && sharing
      ? t('map.onlyYouSharing')
      : friends.length === 0
        ? t('map.nobodySharing')
        : t('map.onMap', { count: broadcastingCount, online: onlineOnMap })

  const avatarPaths = useMemo(() => {
    const paths = friends.map((f) => f.avatarUrl).filter(Boolean) as string[]
    if (me.avatarUrl) paths.push(me.avatarUrl)
    if (selected?.avatarUrl) paths.push(selected.avatarUrl)
    return paths
  }, [friends, me.avatarUrl, selected?.avatarUrl])

  const cachedAvatars = useCachedImageSrcMap(avatarPaths)

  const selectedDistance = useMemo(() => {
    if (!selected || !selfPos) return null
    return formatDistance(
      distanceMeters(selfPos.lat, selfPos.lng, selected.latitude, selected.longitude)
    )
  }, [selected, selfPos])

  useEffect(() => {
    if (!selected) {
      setSelectedAddress(null)
      setAddressLoading(false)
      return
    }

    let cancelled = false
    setAddressLoading(true)
    setSelectedAddress(null)

    void reverseGeocode(selected.latitude, selected.longitude)
      .then((address) => {
        if (!cancelled) setSelectedAddress(address)
      })
      .finally(() => {
        if (!cancelled) setAddressLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [selected?.id, selected?.latitude, selected?.longitude])

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
        const active = me.sharingLocation || isLocationSharingActive()
        setSharing(active)
        if (active) {
          setCompactShareUi(true)
          localStorage.setItem(SHARE_UI_COMPACT_KEY, '1')
        }
        setFriends(list)
        if (me.latitude != null && me.longitude != null) {
          setSelfPos({ lat: me.latitude, lng: me.longitude })
        }
      } catch (e) {
        if (!cancelled) toastError(getApiErrorMessage(e, t('map.loadFailed')))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [isNative])

  const onLocationEvent = useCallback(
    (socket: Socket) => {
      socket.on('friend:location', (payload: FriendLocation) => {
        if (payload?.id) upsertFriend(payload)
      })
      socket.on('friend:location:off', (payload: { id?: string }) => {
        if (payload?.id) removeFriend(payload.id)
      })
      return () => {
        socket.off('friend:location')
        socket.off('friend:location:off')
      }
    },
    [upsertFriend, removeFriend]
  )

  useSocket(isNative, onLocationEvent)

  useEffect(() => {
    if (!isNative || !mapElRef.current || mapRef.current) return

    const map = L.map(mapElRef.current, {
      zoomControl: false,
      attributionControl: true,
    }).setView([55.751, 37.618], 12)

    const tileLayer = L.tileLayer(MAP_TILE_URLS[resolvedTheme], {
      attribution: TILE_ATTRIBUTION,
      subdomains: 'abcd',
      maxZoom: 20,
    }).addTo(map)
    tileLayerRef.current = tileLayer

    L.control.zoom({ position: 'topright' }).addTo(map)
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
      tileLayerRef.current = null
      markersRef.current.clear()
      selfMarkerRef.current = null
    }
  }, [isNative])

  useEffect(() => {
    const layer = tileLayerRef.current
    if (!layer) return
    layer.setUrl(MAP_TILE_URLS[resolvedTheme])
  }, [resolvedTheme])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    for (const friend of friends) {
      const icon = L.divIcon({
        className: 'map-marker-wrap',
        html: userMarkerHtml({
          nickname: friend.nickname,
          src: avatarDisplaySrc(friend.avatarUrl, cachedAvatars),
          variant: 'friend',
          selected: selected?.id === friend.id,
        }),
        iconSize: [markerSize, markerSize],
        iconAnchor: [markerAnchor, markerAnchor],
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
  }, [friends, selected, markerSize, markerAnchor, cachedAvatars])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !selfPos) return

    const icon = L.divIcon({
      className: 'map-marker-wrap',
      html: userMarkerHtml({
        nickname: me.nickname || t('common.me'),
        src: avatarDisplaySrc(me.avatarUrl, cachedAvatars),
        variant: 'self',
      }),
      iconSize: [markerSize, markerSize],
      iconAnchor: [markerAnchor, markerAnchor],
    })

    if (selfMarkerRef.current) {
      selfMarkerRef.current.setLatLng([selfPos.lat, selfPos.lng])
      selfMarkerRef.current.setIcon(icon)
    } else {
      selfMarkerRef.current = L.marker([selfPos.lat, selfPos.lng], { icon, zIndexOffset: 1000 })
      selfMarkerRef.current.addTo(map)
    }
  }, [selfPos, me.nickname, me.avatarUrl, markerSize, markerAnchor, cachedAvatars])

  useEffect(() => {
    if (!selected || !mapRef.current) return
    mapRef.current.flyTo([selected.latitude, selected.longitude], 15, { duration: 0.8 })
  }, [selected])

  async function setSharingEnabled(next: boolean) {
    if (sharingBusy || sharing === next) return
    setSharingBusy(true)
    try {
      if (next) {
        await startLocationSharing()
        setSharing(true)
        const pos = await Geolocation.getCurrentPosition({
          enableHighAccuracy: true,
          timeout: 12_000,
          maximumAge: 0,
        })
        setSelfPos({ lat: pos.coords.latitude, lng: pos.coords.longitude })
        mapRef.current?.setView([pos.coords.latitude, pos.coords.longitude], 15)
      } else {
        await stopLocationSharing()
        setSharing(false)
      }
    } catch (e) {
      const code = (e as Error).message
      if (code === 'not_always') {
        toastError(t('map.allowAlways'))
        void openAlwaysLocationSettings()
      } else if (code === 'permission_denied') {
        toastError(t('map.locationRequired'))
      } else {
        toastError(getApiErrorMessage(e, t('map.toggleFailed')))
      }
    } finally {
      setSharingBusy(false)
    }
  }

  function dismissSharePrompt() {
    setCompactShareUi(true)
    localStorage.setItem(SHARE_UI_COMPACT_KEY, '1')
  }

  async function tryEnableSharing() {
    if (sharingBusy) return

    const { granted } = await checkAlwaysLocationPermission()
    if (granted) {
      await setSharingEnabled(true)
      return
    }

    setShareExplainOpen(true)
  }

  async function confirmEnableSharing() {
    setShareExplainOpen(false)
    await setSharingEnabled(true)
  }

  async function handleStartBroadcast() {
    dismissSharePrompt()
    await tryEnableSharing()
  }

  async function toggleSharing() {
    if (sharing) {
      await setSharingEnabled(false)
      return
    }
    await tryEnableSharing()
  }

  async function centerOnMe() {
    if (locating) return
    setLocating(true)
    try {
      const pos = await Geolocation.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: 12_000,
        maximumAge: 0,
      })
      const lat = pos.coords.latitude
      const lng = pos.coords.longitude
      setSelfPos({ lat, lng })
      const map = mapRef.current
      if (map) {
        map.flyTo([lat, lng], Math.max(map.getZoom(), 15), { duration: 0.6 })
      }
    } catch {
      toastError(t('map.locateFailed'))
    } finally {
      setLocating(false)
    }
  }

  async function openRouteToSelected() {
    if (!selected) return
    try {
      await openNavigationRoute({
        lat: selected.latitude,
        lng: selected.longitude,
        label: `@${selected.nickname}`,
        originLat: selfPos?.lat,
        originLng: selfPos?.lng,
      })
    } catch {
      toastError(t('map.navFailed'))
    }
  }

  if (!isNative) return <NativeAppGate />

  return (
    <div className="relative h-[calc(100dvh-5.5rem)] min-h-[420px] w-full overflow-hidden">
      <div ref={mapElRef} className="absolute inset-0 z-0 streak-map" />

      <div className="map-page-header pointer-events-none absolute inset-x-0 top-0 z-10 px-5 pb-10 pt-[max(3rem,calc(env(safe-area-inset-top)+1rem))]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--color-brand-primary)]">
              Live map
            </p>
            <h1 className="text-2xl font-black text-[var(--color-on-surface)]">
              {t('map.friendsMapTitle')}
            </h1>
            <p className="mt-1 text-xs text-[var(--color-on-surface-variant)]">{mapStatusText}</p>
          </div>
          <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-subtle bg-[var(--color-surface-container-high)] px-3 py-2 text-xs font-semibold text-on-surface shadow-[0_4px_16px_var(--map-control-shadow)]">
            <Users size={14} className="text-[var(--color-brand-primary)]" />
            {broadcastingCount}
          </div>
        </div>
      </div>

      {selected && (
        <div className="absolute inset-x-4 bottom-[calc(9.5rem+env(safe-area-inset-bottom))] z-20">
          <div className="glass-card rounded-[28px] border border-subtle p-4 shadow-[0_20px_50px_rgba(0,0,0,0.55)]">
            <div className="mb-3 flex items-start gap-3">
              <div className="h-14 w-14 shrink-0 overflow-hidden rounded-full bg-[var(--color-surface-container-high)] ring-2 ring-[var(--color-brand-primary)]">
                {selected.avatarUrl ? (
                  <CachedImage
                    path={selected.avatarUrl}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-xl font-bold text-on-surface">
                    {selected.nickname.slice(0, 1).toUpperCase()}
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <p className="truncate text-lg font-black text-on-surface">
                    @{selected.nickname}
                  </p>
                  <button
                    type="button"
                    onClick={() => setSelected(null)}
                    className="shrink-0 rounded-full p-1.5 text-[var(--color-on-surface-variant)]"
                    aria-label={t('common.close')}
                  >
                    <X size={18} />
                  </button>
                </div>
                <p className="mt-0.5 text-xs text-[var(--color-on-surface-variant)]">
                  {formatRelativeTime(selected.updatedAt)}
                </p>
              </div>
            </div>

            <div className="mb-3 space-y-2 rounded-2xl bg-overlay-scrim px-3 py-3">
              <div className="flex items-start gap-2">
                <MapPin size={15} className="mt-0.5 shrink-0 text-[var(--color-brand-primary)]" />
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-on-surface-variant)]">
                    {t('map.locationLabel')}
                  </p>
                  <p className="text-sm leading-snug text-on-surface">
                    {addressLoading ? t('map.resolving') : (selectedAddress ?? '—')}
                  </p>
                </div>
              </div>
              <div className="flex items-center justify-between gap-3 border-t border-subtle pt-2 text-xs">
                <span className="text-[var(--color-on-surface-variant)]">
                  {formatCoords(selected.latitude, selected.longitude)}
                </span>
                <span className="font-semibold text-on-surface">
                  {selectedDistance
                    ? t('map.distanceFromYou', { distance: selectedDistance })
                    : t('map.distanceUnknown')}
                </span>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => void openRouteToSelected()}
                className="btn btn--primary flex-1"
              >
                <Navigation size={18} />
                {t('map.route')}
              </button>
              <Link to={`/${selected.nickname}`} className="btn btn--secondary">
                {t('nav.profile')}
              </Link>
            </div>
          </div>
        </div>
      )}

      {compactShareUi && (
        <div className="map-map-control map-map-control--share pointer-events-auto">
          <button
            type="button"
            disabled={sharingBusy}
            onClick={() => void toggleSharing()}
            aria-label={sharing ? t('map.disableSharing') : t('map.enableSharing')}
            aria-pressed={sharing}
            title={sharing ? t('map.sharingOn') : t('map.sharingOff')}
            className={`map-map-control__btn ${sharing ? 'map-map-control__btn--on' : ''}`}
          >
            <Radio
              size={18}
              className={sharing ? 'animate-pulse text-[var(--color-brand-primary)]' : 'opacity-70'}
            />
          </button>
        </div>
      )}

      <div
        className={`map-map-control pointer-events-auto ${compactShareUi ? 'map-map-control--locate-below-share' : 'map-map-control--locate-solo'}`}
      >
        <button
          type="button"
          disabled={locating}
          onClick={() => void centerOnMe()}
          aria-label={t('map.locateMe')}
          title={t('map.locateMe')}
          className="map-map-control__btn"
        >
          <Locate
            size={18}
            className={locating ? 'animate-pulse text-[var(--color-brand-primary)]' : ''}
          />
        </button>
      </div>

      {shareExplainOpen && (
        <div
          className="fixed inset-0 z-[200] flex items-end justify-center p-4 backdrop-blur-sm sm:items-center"
          style={{ background: 'var(--map-modal-scrim)' }}
        >
          <div
            className="w-full max-w-md rounded-3xl border border-subtle bg-[var(--color-surface-container-high)] p-6 shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="map-share-explain-title"
          >
            <h2 id="map-share-explain-title" className="text-lg font-bold text-on-surface">
              {t('map.shareExplainTitle')}
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-[var(--color-on-surface-variant)]">
              {t('map.shareExplainBody')}
            </p>
            <p className="mt-2 text-xs leading-relaxed text-[var(--color-on-surface-variant)] opacity-90">
              {t('map.shareExplainAlways')}
            </p>
            <div className="mt-6 flex flex-col gap-2">
              <button
                type="button"
                disabled={sharingBusy}
                onClick={() => void confirmEnableSharing()}
                className="btn btn--primary w-full"
              >
                {sharingBusy ? '…' : t('map.shareExplainContinue')}
              </button>
              <button
                type="button"
                disabled={sharingBusy}
                onClick={() => setShareExplainOpen(false)}
                className="btn btn--ghost w-full"
              >
                {t('common.cancel')}
              </button>
            </div>
          </div>
        </div>
      )}

      {!compactShareUi && (
        <div className="absolute inset-x-0 bottom-4 z-20 flex justify-center px-4">
          <div className="glass-card w-full max-w-md rounded-[28px] border border-subtle p-4 shadow-[0_20px_60px_rgba(0,0,0,0.55)]">
            <div className="mb-3 flex items-center gap-2 text-xs text-[var(--color-on-surface-variant)]">
              <MapPin size={14} className="text-[var(--color-brand-primary)]" />
              {t('map.backgroundMessage')}
            </div>
            <button
              type="button"
              disabled={sharingBusy}
              onClick={() => void handleStartBroadcast()}
              className="btn btn--primary btn--lg w-full"
            >
              <Radio size={20} />
              {sharingBusy ? '…' : t('map.shareLocation')}
            </button>
            <button
              type="button"
              onClick={dismissSharePrompt}
              className="mt-2 w-full text-center text-xs font-medium text-[var(--color-on-surface-variant)] underline-offset-2 hover:text-on-surface hover:underline"
            >
              {t('common.soon')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
