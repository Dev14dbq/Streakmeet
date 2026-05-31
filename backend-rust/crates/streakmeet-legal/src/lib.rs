//! Legal consent — parity with `backend/src/legal/*`.

mod documents;
mod locales;
mod service;

pub use documents::{
    AcceptLegalResponse, LegalStatusResponse, accept_current_legal_for_user,
    ensure_legal_documents, get_legal_status_for_user,
};
pub use locales::LegalSlug;
pub use service::{LegalDocumentJson, get_legal_document};
