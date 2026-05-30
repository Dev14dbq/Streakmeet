//! Legal locale helpers — parity with `backend/src/legal/locales.ts` (core en/ru).

pub const LEGAL_LOCALES: &[&str] = &[
    "en", "ru", "es", "zh", "ja", "de", "fr", "pt", "it", "ko", "ar", "hi", "tr", "pl", "id",
];

pub fn normalize_legal_locale(raw: Option<&str>) -> String {
    let Some(raw) = raw.filter(|s| !s.is_empty()) else {
        return "en".into();
    };
    let base = raw.to_lowercase();
    let base = base.split('-').next().unwrap_or(&base);
    if LEGAL_LOCALES.contains(&base) {
        base.to_string()
    } else {
        "en".into()
    }
}

pub fn terms_title(locale: &str) -> &'static str {
    match locale {
        "ru" => "Условия использования",
        "es" => "Terminos de servicio",
        "de" => "Nutzungsbedingungen",
        "fr" => "Conditions d'utilisation",
        _ => "Terms of Service",
    }
}

pub fn privacy_title(locale: &str) -> &'static str {
    match locale {
        "ru" => "Политика конфиденциальности",
        "es" => "Politica de privacidad",
        "de" => "Datenschutzrichtlinie",
        "fr" => "Politique de confidentialite",
        _ => "Privacy Policy",
    }
}

pub const TERMS_EN: &str = r#"<p>Last updated: May 26, 2026</p>
<h2>1. Acceptance of Terms</h2>
<p>By using StreakMeet, you agree to these Terms of Service. If you do not agree, please do not use the app. These Terms form a binding agreement between you and StreakMeet.</p>
<h2>2. Description of Service</h2>
<p>StreakMeet is a social app for maintaining real-life meet streaks with friends. The app uses geolocation and face recognition to verify meets and supports photo sharing (including remote selfies).</p>
<h2>3. Account Registration and Security</h2>
<p>You must create an account to use the app. You agree to provide accurate information and are responsible for safeguarding your credentials and all activity under your account.</p>
<h2>4. User Content and License</h2>
<p>You retain rights to content you upload. By uploading content, you grant StreakMeet a non-exclusive, royalty-free, worldwide license to use, store, display, reproduce, and modify that content solely to operate and improve the service.</p>
<h2>5. Conduct and Restrictions</h2>
<p>You may not use the service for illegal, fraudulent, or malicious purposes; upload offensive or infringing content; attempt unauthorized access; or use others' photos or biometrics without consent.</p>
<h2>6. Termination</h2>
<p>We may suspend or delete your account at any time if you violate these Terms or applicable law.</p>
<h2>7. Limitation of Liability</h2>
<p>The service is provided "as is". StreakMeet is not liable for direct or indirect damages arising from use or inability to use the app.</p>
<h2>8. Changes</h2>
<p>We may update these Terms. For material changes we will notify you in the app. Continued use constitutes acceptance.</p>"#;

pub const PRIVACY_EN: &str = r#"<p>Last updated: May 26, 2026</p>
<h2>1. Introduction</h2>
<p>StreakMeet takes your privacy seriously. This Policy describes how we collect, use, store, and protect your personal data in accordance with GDPR.</p>
<h2>2. Data We Collect</h2>
<p>Account data (email, username, nickname, password hash), content (profile and meet photos), biometric face vectors for meet verification, location data when you enable it, and technical data (IP, timezone, device logs).</p>
<h2>3. Purposes</h2>
<p>We process data to provide the app, verify in-person meets, secure accounts, and improve the service.</p>
<h2>4. Biometrics</h2>
<p>Face vectors are processed only with your explicit consent during face enrollment and are used solely for Magic Meet verification. You may withdraw consent and delete biometrics at any time.</p>
<h2>5. Location</h2>
<p>Location is collected only with OS permission. Sharing with friends is opt-in and can be disabled anytime.</p>
<h2>6. Storage and Sharing</h2>
<p>Data is stored on secured servers. We do not sell your data. Third-party sharing is limited to infrastructure providers under GDPR standards or lawful requests.</p>
<h2>7. Retention</h2>
<p>Data is kept while your account exists. On deletion, soft delete applies for 30 days, then permanent removal from active databases (backups up to 90 days).</p>
<h2>8. Your Rights</h2>
<p>Access, rectification, erasure, restriction, portability, and withdrawal of consent — via app settings or contacting us.</p>"#;

pub fn get_localized_legal(
    slug: LegalSlug,
    locale: &str,
    fallback_content: &str,
) -> (String, String) {
    let title = match slug {
        LegalSlug::Terms => terms_title(locale),
        LegalSlug::Privacy => privacy_title(locale),
    }
    .to_string();

    let content = if locale == "ru" {
        fallback_content.to_string()
    } else if locale == "en" {
        match slug {
            LegalSlug::Terms => TERMS_EN.to_string(),
            LegalSlug::Privacy => PRIVACY_EN.to_string(),
        }
    } else {
        match slug {
            LegalSlug::Terms => TERMS_EN.to_string(),
            LegalSlug::Privacy => PRIVACY_EN.to_string(),
        }
    };

    (title, content)
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LegalSlug {
    Terms,
    Privacy,
}

impl LegalSlug {
    pub fn from_param(slug: &str) -> Option<Self> {
        match slug.to_lowercase().as_str() {
            "terms" => Some(Self::Terms),
            "privacy" => Some(Self::Privacy),
            _ => None,
        }
    }

    pub fn db_slug(self) -> &'static str {
        match self {
            Self::Terms => "TERMS",
            Self::Privacy => "PRIVACY",
        }
    }

    pub fn response_slug(self) -> &'static str {
        match self {
            Self::Terms => "terms",
            Self::Privacy => "privacy",
        }
    }
}
