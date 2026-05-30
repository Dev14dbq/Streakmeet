//! Legal document seeding — parity with `backend/src/legal/documents.ts`.

use chrono::{DateTime, NaiveDateTime, Utc};
use sqlx::PgPool;
use streakmeet_types::{codes, ApiError};

struct DefaultDoc {
    slug: &'static str,
    title: &'static str,
    content: &'static str,
}

const DEFAULTS: &[DefaultDoc] = &[
    DefaultDoc {
        slug: "TERMS",
        title: "Условия использования",
        content: include_str!("terms.ru.html"),
    },
    DefaultDoc {
        slug: "PRIVACY",
        title: "Политика конфиденциальности",
        content: include_str!("privacy.ru.html"),
    },
];

pub async fn ensure_legal_documents(pool: &PgPool) -> Result<(), ApiError> {
    for doc in DEFAULTS {
        let existing = sqlx::query_scalar::<_, String>(
            r#"SELECT content FROM legal_documents WHERE slug = $1::"LegalDocSlug""#,
        )
        .bind(doc.slug)
        .fetch_optional(pool)
        .await
        .map_err(|_| ApiError::new(500, codes::INTERNAL_ERROR, None))?;

        if existing.is_none() {
            sqlx::query(
                r#"
                INSERT INTO legal_documents (id, slug, title, version, content, "updatedAt")
                VALUES ($1, $2::"LegalDocSlug", $3, 1, $4, NOW())
                "#,
            )
            .bind(streakmeet_types::new_cuid()?)
            .bind(doc.slug)
            .bind(doc.title)
            .bind(doc.content)
            .execute(pool)
            .await
            .map_err(|_| ApiError::new(500, codes::INTERNAL_ERROR, None))?;
        } else if existing.as_deref() != Some(doc.content) {
            sqlx::query(
                r#"
                UPDATE legal_documents
                SET content = $1, version = version + 1, "updatedAt" = NOW()
                WHERE slug = $2::"LegalDocSlug"
                "#,
            )
            .bind(doc.content)
            .bind(doc.slug)
            .execute(pool)
            .await
            .map_err(|_| ApiError::new(500, codes::INTERNAL_ERROR, None))?;
        }
    }
    Ok(())
}

async fn get_current_legal_versions(pool: &PgPool) -> Result<(i32, i32), ApiError> {
    let rows = sqlx::query_as::<_, (String, i32)>(
        r#"SELECT slug::text, version FROM legal_documents"#,
    )
    .fetch_all(pool)
    .await
    .map_err(|_| ApiError::new(500, codes::INTERNAL_ERROR, None))?;

    let terms = rows
        .iter()
        .find(|(slug, _)| slug == "TERMS")
        .map(|(_, v)| *v)
        .unwrap_or(1);
    let privacy = rows
        .iter()
        .find(|(slug, _)| slug == "PRIVACY")
        .map(|(_, v)| *v)
        .unwrap_or(1);
    Ok((terms, privacy))
}

pub async fn accept_current_legal_for_user(
    pool: &PgPool,
    user_id: &str,
) -> Result<AcceptLegalResponse, ApiError> {
    let (terms, privacy) = get_current_legal_versions(pool).await?;
    sqlx::query(
        r#"
        UPDATE users
        SET "acceptedTermsVersion" = $1, "acceptedPrivacyVersion" = $2
        WHERE id = $3
        "#,
    )
    .bind(terms)
    .bind(privacy)
    .bind(user_id)
    .execute(pool)
    .await
    .map_err(|_| ApiError::new(500, codes::INTERNAL_ERROR, None))?;

    Ok(AcceptLegalResponse { terms, privacy })
}

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LegalDocStatus {
    pub version: i32,
    pub accepted: bool,
    pub updated_at: Option<DateTime<Utc>>,
}

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LegalStatusResponse {
    pub needs_acceptance: bool,
    pub terms: LegalDocStatus,
    pub privacy: LegalDocStatus,
}

#[derive(Debug, serde::Serialize)]
pub struct AcceptLegalResponse {
    pub terms: i32,
    pub privacy: i32,
}

pub async fn get_legal_status_for_user(
    pool: &PgPool,
    user_id: &str,
) -> Result<Option<LegalStatusResponse>, ApiError> {
    let user = sqlx::query_as::<_, (i32, i32)>(
        r#"
        SELECT "acceptedTermsVersion", "acceptedPrivacyVersion"
        FROM users WHERE id = $1
        "#,
    )
    .bind(user_id)
    .fetch_optional(pool)
    .await
    .map_err(|_| ApiError::new(500, codes::INTERNAL_ERROR, None))?;

    let Some((accepted_terms, accepted_privacy)) = user else {
        return Ok(None);
    };

    let docs = sqlx::query_as::<_, (String, i32, NaiveDateTime)>(
        r#"SELECT slug::text, version, "updatedAt" FROM legal_documents"#,
    )
    .fetch_all(pool)
    .await
    .map_err(|_| ApiError::new(500, codes::INTERNAL_ERROR, None))?;

    let terms_doc = docs.iter().find(|(slug, _, _)| slug == "TERMS");
    let privacy_doc = docs.iter().find(|(slug, _, _)| slug == "PRIVACY");
    let terms_version = terms_doc.map(|(_, v, _)| *v).unwrap_or(1);
    let privacy_version = privacy_doc.map(|(_, v, _)| *v).unwrap_or(1);

    let terms_accepted = accepted_terms >= terms_version;
    let privacy_accepted = accepted_privacy >= privacy_version;

    Ok(Some(LegalStatusResponse {
        needs_acceptance: !terms_accepted || !privacy_accepted,
        terms: LegalDocStatus {
            version: terms_version,
            accepted: terms_accepted,
            updated_at: terms_doc.map(|(_, _, t)| t.and_utc()),
        },
        privacy: LegalDocStatus {
            version: privacy_version,
            accepted: privacy_accepted,
            updated_at: privacy_doc.map(|(_, _, t)| t.and_utc()),
        },
    }))
}
