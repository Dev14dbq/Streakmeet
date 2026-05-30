import { ArrowLeft, ChevronRight } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

export function SettingsPageShell({
  title,
  subtitle,
  backTo = '/settings',
  backLabel,
  children,
}: {
  title: string
  subtitle?: string
  backTo?: string
  backLabel: string
  children: React.ReactNode
}) {
  const navigate = useNavigate()

  return (
    <div className="flex min-h-full flex-col px-6 pb-8 pt-4">
      <div className="mb-8 flex items-center gap-3">
        <button
          type="button"
          onClick={() => navigate(backTo)}
          className="btn btn--icon-lg btn--secondary"
          aria-label={backLabel}
        >
          <ArrowLeft size={22} />
        </button>
        <div className="min-w-0">
          <h1 className="text-2xl font-extrabold tracking-tight text-[var(--color-on-surface)]">
            {title}
          </h1>
          {subtitle && (
            <p className="mt-1 text-sm text-[var(--color-on-surface-variant)]">{subtitle}</p>
          )}
        </div>
      </div>
      {children}
    </div>
  )
}

export function SettingsSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <h3 className="mb-2 px-1 text-xs font-bold uppercase tracking-widest text-[var(--color-on-surface-variant)]">
        {title}
      </h3>
      <div className="glass-card divide-subtle overflow-hidden rounded-3xl">{children}</div>
    </div>
  )
}

export function SettingsRow({
  icon: Icon,
  label,
  description,
  children,
  onClick,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>
  label: string
  description?: string
  children?: React.ReactNode
  onClick?: () => void
}) {
  const content = (
    <div className="flex items-center justify-between gap-4 px-4 py-4">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--color-surface-container-highest)]">
          <Icon size={18} className="text-[var(--color-on-surface-variant)]" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-[var(--color-on-surface)]">{label}</p>
          {description && (
            <p className="mt-0.5 truncate text-xs text-[var(--color-on-surface-variant)]">
              {description}
            </p>
          )}
        </div>
      </div>
      {children ??
        (onClick ? (
          <ChevronRight size={18} className="shrink-0 text-[var(--color-on-surface-variant)]" />
        ) : null)}
    </div>
  )

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="w-full text-left transition hover:bg-white/5 active:scale-[0.99]"
      >
        {content}
      </button>
    )
  }
  return content
}

export function SettingsToggle({
  on,
  onChange,
  label,
}: {
  on: boolean
  onChange: (v: boolean) => void
  label: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-label={label}
      aria-checked={on}
      onClick={() => onChange(!on)}
      className={`relative h-7 w-12 shrink-0 rounded-full transition ${
        on ? 'bg-[var(--color-brand-primary)]' : 'bg-[var(--color-surface-container-highest)]'
      }`}
    >
      <span
        className={`absolute left-1 top-1 h-5 w-5 rounded-full bg-white shadow transition-transform ${
          on ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  )
}
