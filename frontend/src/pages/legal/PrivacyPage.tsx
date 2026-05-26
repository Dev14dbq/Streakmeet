import { ArrowLeft } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

export default function PrivacyPage() {
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
        <h1 className="text-2xl font-extrabold tracking-tight">Политика конфиденциальности</h1>
      </div>
      <div className="prose prose-invert max-w-none text-sm text-[var(--color-on-surface-variant)] space-y-4">
        <p>Последнее обновление: 26 мая 2026 г.</p>

        <h2 className="text-white font-bold text-lg mt-6">1. Сбор данных</h2>
        <p>
          Мы собираем информацию, которую вы предоставляете напрямую: email, имя пользователя,
          фотографии профиля и фотографии встреч. Мы также собираем данные о вашем местоположении
          (геолокацию), когда вы используете карту или подтверждаете встречу.
        </p>

        <h2 className="text-white font-bold text-lg mt-6">2. Использование биометрии</h2>
        <p>
          Для подтверждения встреч мы используем технологию распознавания лиц. Мы создаем
          математическую модель (вектор) вашего лица. Сами фотографии могут сохраняться для истории
          встреч, но биометрические векторы используются исключительно для сравнения лиц во время
          "Magic Meet".
        </p>

        <h2 className="text-white font-bold text-lg mt-6">3. Геолокация</h2>
        <p>
          Ваше местоположение может транслироваться вашим друзьям на карте в реальном времени, если
          вы включили эту функцию. Вы можете отключить трансляцию в любой момент.
        </p>

        <h2 className="text-white font-bold text-lg mt-6">4. Хранение и безопасность</h2>
        <p>
          Мы принимаем разумные меры для защиты ваших данных. В случае удаления аккаунта, ваши
          данные хранятся в течение 30 дней для возможности восстановления, после чего удаляются
          навсегда.
        </p>

        <h2 className="text-white font-bold text-lg mt-6">5. Передача третьим лицам</h2>
        <p>
          Мы не продаем ваши личные данные третьим лицам. Данные могут быть переданы только в
          случаях, предусмотренных законодательством.
        </p>

        <h2 className="text-white font-bold text-lg mt-6">6. Ваши права</h2>
        <p>
          Вы имеете право запросить доступ к вашим данным, их исправление или удаление. Для этого
          используйте соответствующие функции в настройках приложения.
        </p>
      </div>
    </div>
  )
}
