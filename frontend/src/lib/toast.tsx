import toast from 'react-hot-toast'
import { ChevronRight } from 'lucide-react'

export const toastStyle = {
  borderRadius: '16px',
  background: 'var(--color-surface-container-high, #292a2e)',
  color: '#fff',
  border: '1px solid rgba(255, 255, 255, 0.08)',
  boxShadow: '0 12px 40px rgba(0, 0, 0, 0.45)',
  fontSize: '14px',
  fontWeight: 500,
  padding: '12px 16px',
  maxWidth: 'min(360px, calc(100vw - 32px))',
} as const

const base = {
  duration: 4000,
  style: toastStyle,
}

export function notify(message: string) {
  return toast(message, { ...base, icon: '🔔' })
}

export function toastSuccess(message: string) {
  return toast.success(message, base)
}

export function toastError(message: string) {
  return toast.error(message, { ...base, duration: 5000 })
}

export function toastInfo(message: string) {
  return toast(message, base)
}

export function toastLink(
  message: string,
  route: string,
  navigate: (path: string) => void,
  icon = '🔔'
) {
  return toast(
    (t) => (
      <button
        onClick={() => {
          navigate(route)
          toast.dismiss(t.id)
        }}
        style={{
          all: 'unset',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          width: '100%',
          cursor: 'pointer',
        }}
      >
        <span style={{ flex: 1 }}>{message}</span>
        <ChevronRight size={16} style={{ opacity: 0.5, flexShrink: 0 }} />
      </button>
    ),
    { ...base, duration: 8000, icon }
  )
}
