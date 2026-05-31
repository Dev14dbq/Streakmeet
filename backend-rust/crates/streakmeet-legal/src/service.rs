//! Legal document fetch — parity with `backend/src/legal/service.ts`.

use chrono::NaiveDateTime;
use sqlx::PgPool;
use streakmeet_types::{ApiError, codes};

use crate::locales::{LegalSlug, get_localized_legal};

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LegalDocumentJson {
    pub slug: String,
    pub title: String,
    pub version: i32,
    pub content: String,
    pub updated_at: String,
}

pub async fn get_legal_document(
    pool: &PgPool,
    slug: LegalSlug,
    raw_locale: Option<&str>,
) -> Result<LegalDocumentJson, ApiError> {
    let doc = sqlx::query_as::<_, (String, i32, String, NaiveDateTime)>(
        r#"
        SELECT slug::text, version, content, "updatedAt"
        FROM legal_documents
        WHERE slug = $1::"LegalDocSlug"
        "#,
    )
    .bind(slug.db_slug())
    .fetch_optional(pool)
    .await
    .map_err(|_| ApiError::new(500, codes::INTERNAL_ERROR, None))?
    .ok_or_else(|| ApiError::new(404, codes::LEGAL_DOCUMENT_NOT_FOUND, None))?;

    let locale = crate::locales::normalize_legal_locale(raw_locale);
    let (title, content) = get_localized_legal(slug, &locale, &doc.2);

    Ok(LegalDocumentJson {
        slug: slug.response_slug().to_string(),
        title,
        version: doc.1,
        content,
        updated_at: doc.3.and_utc().to_rfc3339(),
    })
}
