import { ArrowLeft } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

export default function TermsPage() {
  const navigate = useNavigate()

  return (
    <div className="flex flex-col px-6 pt-12 pb-8 min-h-screen bg-black text-white">
      <div className="flex items-center gap-3 mb-8">
        <button
          onClick={() => navigate(-1)}
          className="p-3 rounded-full bg-[var(--color-surface-container-high)] text-white transition active:scale-95 hover:bg-[var(--color-surface-container-highest)]"
        >
          <ArrowLeft size={22} />
        </button>
        <h1 className="text-2xl font-extrabold tracking-tight">Условия использования</h1>
      </div>
      <div className="prose prose-invert max-w-none text-sm text-[var(--color-on-surface-variant)] space-y-4">
        <p>Последнее обновление: 26 мая 2026 г.</p>

        <h2 className="text-white font-bold text-lg mt-6">1. Принятие условий</h2>
        <p>
          Используя приложение StreakMeet, вы соглашаетесь с настоящими Условиями использования.
          Если вы не согласны с какими-либо из этих условий, пожалуйста, не используйте приложение.
        </p>

        <h2 className="text-white font-bold text-lg mt-6">2. Описание сервиса</h2>
        <p>
          StreakMeet — это социальное приложение для поддержания "серий" встреч с друзьями в
          реальной жизни. Приложение использует геолокацию и распознавание лиц для подтверждения
          встреч.
        </p>

        <h2 className="text-white font-bold text-lg mt-6">3. Регистрация аккаунта</h2>
        <p>
          Для использования приложения необходимо создать аккаунт. Вы несете ответственность за
          сохранность ваших учетных данных и за все действия, происходящие под вашим аккаунтом.
        </p>

        <h2 className="text-white font-bold text-lg mt-6">4. Контент пользователя</h2>
        <p>
          Вы сохраняете права на все фотографии и данные, которые загружаете в приложение. Вы
          предоставляете нам лицензию на использование этого контента для обеспечения работы
          сервиса.
        </p>

        <h2 className="text-white font-bold text-lg mt-6">5. Ограничения</h2>
        <p>
          Запрещается использовать приложение для незаконных целей, загружать оскорбительный контент
          или пытаться нарушить работу сервиса.
        </p>

        <h2 className="text-white font-bold text-lg mt-6">6. Изменения условий</h2>
        <p>
          Мы можем периодически обновлять эти Условия. Продолжение использования приложения после
          внесения изменений означает ваше согласие с новыми Условиями.
        </p>
      </div>
    </div>
  )
}
