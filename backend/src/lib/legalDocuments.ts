import { prisma } from './prisma.js'

const TERMS_HTML = `<p>Последнее обновление: 26 мая 2026 г.</p>

<h2>1. Принятие условий</h2>
<p>Используя приложение StreakMeet, вы соглашаетесь с настоящими Условиями использования. Если вы не согласны с какими-либо из этих условий, пожалуйста, не используйте приложение.</p>

<h2>2. Описание сервиса</h2>
<p>StreakMeet — это социальное приложение для поддержания «серий» встреч с друзьями в реальной жизни. Приложение использует геолокацию и распознавание лиц для подтверждения встреч.</p>

<h2>3. Регистрация аккаунта</h2>
<p>Для использования приложения необходимо создать аккаунт. Вы несёте ответственность за сохранность ваших учётных данных и за все действия, происходящие под вашим аккаунтом.</p>

<h2>4. Контент пользователя</h2>
<p>Вы сохраняете права на все фотографии и данные, которые загружаете в приложение. Вы предоставляете нам лицензию на использование этого контента для обеспечения работы сервиса.</p>

<h2>5. Ограничения</h2>
<p>Запрещается использовать приложение для незаконных целей, загружать оскорбительный контент или пытаться нарушить работу сервиса.</p>

<h2>6. Изменения условий</h2>
<p>Мы можем периодически обновлять эти Условия. Продолжение использования приложения после внесения изменений означает ваше согласие с новыми Условиями.</p>`

const PRIVACY_HTML = `<p>Последнее обновление: 26 мая 2026 г.</p>

<h2>1. Сбор данных</h2>
<p>Мы собираем информацию, которую вы предоставляете напрямую: email, имя пользователя, фотографии профиля и фотографии встреч. Мы также собираем данные о вашем местоположении (геолокацию), когда вы используете карту или подтверждаете встречу.</p>

<h2>2. Использование биометрии</h2>
<p>Для подтверждения встреч мы используем технологию распознавания лиц. Мы создаём математическую модель (вектор) вашего лица. Сами фотографии могут сохраняться для истории встреч, но биометрические векторы используются исключительно для сравнения лиц во время Magic Meet.</p>

<h2>3. Геолокация</h2>
<p>Ваше местоположение может транслироваться вашим друзьям на карте в реальном времени, если вы включили эту функцию. Вы можете отключить трансляцию в любой момент.</p>

<h2>4. Хранение и безопасность</h2>
<p>Мы принимаем разумные меры для защиты ваших данных. В случае удаления аккаунта ваши данные хранятся в течение 30 дней для возможности восстановления, после чего удаляются навсегда.</p>

<h2>5. Передача третьим лицам</h2>
<p>Мы не продаём ваши личные данные третьим лицам. Данные могут быть переданы только в случаях, предусмотренных законодательством.</p>

<h2>6. Ваши права</h2>
<p>Вы имеете право запросить доступ к вашим данным, их исправление или удаление. Для этого используйте соответствующие функции в настройках приложения.</p>`

const DEFAULTS = [
  {
    slug: 'TERMS' as const,
    title: 'Условия использования',
    content: TERMS_HTML,
  },
  {
    slug: 'PRIVACY' as const,
    title: 'Политика конфиденциальности',
    content: PRIVACY_HTML,
  },
]

export async function ensureLegalDocuments() {
  for (const doc of DEFAULTS) {
    await prisma.legalDocument.upsert({
      where: { slug: doc.slug },
      create: {
        slug: doc.slug,
        title: doc.title,
        version: 1,
        content: doc.content,
      },
      update: {},
    })
  }
}

export async function getCurrentLegalVersions() {
  const docs = await prisma.legalDocument.findMany({
    select: { slug: true, version: true },
  })
  const terms = docs.find((d) => d.slug === 'TERMS')?.version ?? 1
  const privacy = docs.find((d) => d.slug === 'PRIVACY')?.version ?? 1
  return { terms, privacy }
}

export async function acceptCurrentLegalForUser(userId: string) {
  const { terms, privacy } = await getCurrentLegalVersions()
  await prisma.user.update({
    where: { id: userId },
    data: {
      acceptedTermsVersion: terms,
      acceptedPrivacyVersion: privacy,
    },
  })
  return { terms, privacy }
}

export async function getLegalStatusForUser(userId: string) {
  const [user, docs] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { acceptedTermsVersion: true, acceptedPrivacyVersion: true },
    }),
    prisma.legalDocument.findMany({
      select: { slug: true, title: true, version: true, updatedAt: true },
    }),
  ])

  if (!user) return null

  const termsDoc = docs.find((d) => d.slug === 'TERMS')
  const privacyDoc = docs.find((d) => d.slug === 'PRIVACY')
  const termsVersion = termsDoc?.version ?? 1
  const privacyVersion = privacyDoc?.version ?? 1

  const termsAccepted = user.acceptedTermsVersion >= termsVersion
  const privacyAccepted = user.acceptedPrivacyVersion >= privacyVersion

  return {
    needsAcceptance: !termsAccepted || !privacyAccepted,
    terms: {
      version: termsVersion,
      accepted: termsAccepted,
      updatedAt: termsDoc?.updatedAt ?? null,
    },
    privacy: {
      version: privacyVersion,
      accepted: privacyAccepted,
      updatedAt: privacyDoc?.updatedAt ?? null,
    },
  }
}
