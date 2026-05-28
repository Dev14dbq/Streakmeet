# Настройка Resend для production

## Почему письма не уходят с `onboarding@resend.dev`

На бесплатном/тестовом режиме Resend **разрешает отправку только на email владельца аккаунта** (тот, с которым вы регистрировались в [Resend](https://resend.com)).

Ошибка в API выглядит так:

```text
You can only send testing emails to your own email address (...).
To send emails to other recipients, please verify a domain at resend.com/domains
```

Пока домен не верифицирован, в [логах Resend](https://resend.com/emails) писем не будет — запрос отклоняется до отправки.

## Что сделать для spectrmod.com

1. Откройте [resend.com/domains](https://resend.com/domains) → **Add Domain** → `spectrmod.com`
2. Добавьте DNS-записи (SPF, DKIM), которые покажет Resend
3. Дождитесь статуса **Verified**
4. В `backend/.env` на сервере:

```env
RESEND_API_KEY=re_...
RESEND_FROM_EMAIL="StreakMeet <noreply@spectrmod.com>"
APP_PUBLIC_URL="https://spectrmod.com"
```

5. Перезапустите API:

```bash
cd /home/streakmeet/backend && npm run build
pm2 restart streakmeet-api
```

## Проверка

```bash
cd /home/streakmeet/backend
npx tsx -e "
import dotenv from 'dotenv';
import { Resend } from 'resend';
dotenv.config();
const r = new Resend(process.env.RESEND_API_KEY);
const res = await r.emails.send({
  from: process.env.RESEND_FROM_EMAIL,
  to: 'ВАШ_EMAIL@example.com',
  subject: 'Test',
  html: '<p>ok</p>',
});
console.log(res);
"
```

В ответе должно быть `data: { id: '...' }`, без `error`.

## Дополнительно

- Сброс пароля работает **только для аккаунтов с email+паролем**. Вход через Google/Apple — без пароля, сброс не нужен.
- Если отправка падает, API теперь возвращает `EMAIL_SEND_FAILED`, а не ложный «успех».
