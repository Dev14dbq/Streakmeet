//! Resend HTTP API — parity with `backend/src/notifications/email.ts`.

use reqwest::Client;
use streakmeet_types::{codes, ApiError};

fn app_public_url() -> String {
    std::env::var("APP_PUBLIC_URL")
        .unwrap_or_else(|_| "https://spectrmod.com".into())
        .trim_end_matches('/')
        .to_string()
}

fn from_email() -> String {
    std::env::var("RESEND_FROM_EMAIL")
        .unwrap_or_else(|_| "StreakMeet <onboarding@resend.dev>".into())
}

pub fn verification_link(token: &str) -> String {
    format!("{}/verify-email?token={token}", app_public_url())
}

pub fn reset_password_link(token: &str) -> String {
    format!("{}/reset-password?token={token}", app_public_url())
}

async fn send_via_resend(to: &str, subject: &str, html: &str) -> Result<(), ApiError> {
    let api_key = std::env::var("RESEND_API_KEY")
        .map_err(|_| ApiError::new(500, codes::EMAIL_SEND_FAILED, None))?;

    let client = Client::new();
    let resp = client
        .post("https://api.resend.com/emails")
        .header("Authorization", format!("Bearer {api_key}"))
        .json(&serde_json::json!({
            "from": from_email(),
            "to": [to],
            "subject": subject,
            "html": html,
        }))
        .send()
        .await
        .map_err(|e| {
            tracing::error!(error = %e, "[email] Resend request failed");
            ApiError::new(500, codes::EMAIL_SEND_FAILED, None)
        })?;

    let status = resp.status();
    let body: serde_json::Value = resp.json().await.unwrap_or_default();

    if !status.is_success() {
        tracing::error!(?body, "[email] Resend API error");
        return Err(ApiError::new(500, codes::EMAIL_SEND_FAILED, None));
    }

    if body.get("id").and_then(|v| v.as_str()).is_none() {
        tracing::error!(?body, "[email] Resend returned no message id");
        return Err(ApiError::new(500, codes::EMAIL_SEND_FAILED, None));
    }

    tracing::info!(to, "[email] Sent via Resend");
    Ok(())
}

pub async fn send_verification_email(to: &str, token: &str) -> Result<(), ApiError> {
    let link = verification_link(token);
    let html = format!(
        r#"
      <p>Здравствуйте!</p>
      <p>Нажмите кнопку, чтобы подтвердить email для StreakMeet:</p>
      <p><a href="{link}" style="display:inline-block;padding:12px 24px;background:#7c3aed;color:#fff;text-decoration:none;border-radius:8px;font-weight:600">Подтвердить email</a></p>
      <p>Или скопируйте ссылку: <br/><a href="{link}">{link}</a></p>
      <p>Ссылка действует 24 часа.</p>
    "#
    );
    send_via_resend(to, "Подтвердите email — StreakMeet", &html).await
}

pub async fn send_password_reset_email(to: &str, token: &str) -> Result<(), ApiError> {
    let link = reset_password_link(token);
    let html = format!(
        r#"
      <p>Здравствуйте!</p>
      <p>Вы запросили сброс пароля. Нажмите кнопку:</p>
      <p><a href="{link}" style="display:inline-block;padding:12px 24px;background:#7c3aed;color:#fff;text-decoration:none;border-radius:8px;font-weight:600">Сбросить пароль</a></p>
      <p>Или скопируйте ссылку: <br/><a href="{link}">{link}</a></p>
      <p>Ссылка действует 1 час. Если вы не запрашивали сброс — проигнорируйте письмо.</p>
    "#
    );
    send_via_resend(to, "Сброс пароля — StreakMeet", &html).await
}
