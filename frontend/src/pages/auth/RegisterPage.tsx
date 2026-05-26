import { useTranslation } from 'react-i18next'

export default function RegisterPage() {
  const { t } = useTranslation()
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-black px-6">
      <h1 className="mb-8 text-4xl font-bold text-white">🔥 StreakMeet</h1>
      <p className="text-zinc-400">{t('stub.registerSoon')}</p>
    </div>
  )
}
