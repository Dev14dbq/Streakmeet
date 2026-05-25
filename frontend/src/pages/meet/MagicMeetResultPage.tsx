import { useLocation, useNavigate } from 'react-router-dom'
import { Flame } from 'lucide-react'
import type { MagicMeetPartner } from '../../lib/api'

export interface MagicMeetResultState {
  photo: string
  message: string
  partners: MagicMeetPartner[]
}

const API_URL = import.meta.env.VITE_API_URL || ''

export default function MagicMeetResultPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const state = location.state as MagicMeetResultState | null

  if (!state?.photo || !state.partners?.length) {
    return (
      <div className="min-h-[100dvh] bg-black flex flex-col items-center justify-center px-6 text-center">
        <p className="text-zinc-400 mb-6">Результат встречи не найден</p>
        <button
          type="button"
          onClick={() => navigate('/', { replace: true })}
          className="rounded-full bg-[var(--color-brand-primary)] px-8 py-3 font-bold text-white"
        >
          На главную
        </button>
      </div>
    )
  }

  const { photo, message, partners } = state

  return (
    <div className="min-h-[100dvh] bg-black flex flex-col px-6 pt-[max(2rem,env(safe-area-inset-top))] pb-[max(2rem,env(safe-area-inset-bottom))]">
      <div className="flex-1 flex flex-col items-center justify-center">
        <div className="enroll-success-circle mb-8">
          <div className="w-20 h-20 rounded-full bg-[var(--color-brand-primary)]/15 border-2 border-[var(--color-brand-primary)] flex items-center justify-center">
            <Flame size={36} className="text-[var(--color-brand-primary)]" fill="currentColor" />
          </div>
        </div>

        <h1 className="enroll-success-label text-3xl font-extrabold text-white tracking-tight text-center mb-2">
          Серия продлена!
        </h1>
        <p className="enroll-success-label text-sm text-[var(--color-on-surface-variant)] text-center max-w-xs mb-8">
          {message}
        </p>

        <div className="enroll-success-label w-full max-w-sm rounded-3xl overflow-hidden border border-white/10 shadow-[0_10px_40px_rgba(0,0,0,0.5)] mb-6">
          <img src={photo} alt="Фото встречи" className="w-full aspect-[4/3] object-cover" />
        </div>

        <div className="enroll-success-label w-full max-w-sm">
          <p className="text-xs text-zinc-500 uppercase tracking-wider font-bold mb-3 text-center">
            На фото с тобой
          </p>
          <div className="flex flex-col gap-3">
            {partners.map((partner) => (
              <div
                key={partner.nickname}
                className="glass-card rounded-2xl p-4 flex items-center gap-4"
              >
                <div className="w-12 h-12 rounded-full bg-[var(--color-surface-container-highest)] flex items-center justify-center overflow-hidden border border-white/5 shrink-0">
                  {partner.avatarUrl ? (
                    <img
                      src={API_URL + partner.avatarUrl}
                      alt={partner.nickname}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-xl">👤</span>
                  )}
                </div>
                <div>
                  <p className="font-bold text-white">@{partner.nickname}</p>
                  <p className="text-xs text-[var(--color-brand-primary)] font-medium mt-0.5">
                    Серия продлена 🔥
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={() => navigate('/', { replace: true })}
        className="enroll-success-btn w-full max-w-sm mx-auto rounded-full bg-[var(--color-brand-primary)] py-4 text-base font-bold text-white shadow-[0_8px_20px_rgba(255,26,79,0.3)] transition hover:opacity-90 active:scale-95"
      >
        Отлично!
      </button>
    </div>
  )
}
