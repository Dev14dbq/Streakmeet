import "@typespec/http";

using TypeSpec.Http;

namespace StreakMeet.Legal;

model LegalDocument {
  slug: LegalSlug;
  title: string;
  version: int32;
  content: string;
  updatedAt: utcDateTime;
}

model LegalConsentItem {
  version: int32;
  accepted: boolean;
  updatedAt: utcDateTime | null;
}

model LegalConsentStatus {
  needsAcceptance: boolean;
  terms: LegalConsentItem;
  privacy: LegalConsentItem;
}

model AcceptLegalResponse {
  ok: true;
  terms: int32;
  privacy: int32;
}

@route("/api/legal")
interface LegalRoutes {
  @get
  @route("/status/me")
  @useAuth(TypeSpec.Http.BearerAuth)
  getConsentStatus(): LegalConsentStatus;

  @post
  @route("/accept")
  @useAuth(TypeSpec.Http.BearerAuth)
  acceptDocuments(): AcceptLegalResponse;

  @get
  @route("/{slug}")
  getDocument(@path slug: LegalSlug): LegalDocument;
}
