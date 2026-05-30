//! Legal consent — parity with `backend/src/legal/*`.

mod documents;
mod locales;
mod service;

pub use documents::{
    accept_current_legal_for_user, ensure_legal_documents, get_legal_status_for_user,
    AcceptLegalResponse, LegalStatusResponse,
};
pub use locales::LegalSlug;
pub use service::{get_legal_document, LegalDocumentJson};
