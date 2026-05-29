import "@typespec/http";

using TypeSpec.Http;

namespace StreakMeet.Users;

model UpdateSettingsRequest {
  timezone: string;
}

model UpdateEmailRequest {
  email: string;
  currentPassword: string;
}

model UpdatePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

model UpdatePublicRequest {
  isPublic: boolean;
}

model UpdatePreferencesRequest {
  notifyFriends?: boolean;
  notifyMeet?: boolean;
  geoOnPhotos?: boolean;
}

model UploadAvatarRequest {
  photoBase64: string;
}

model UploadAvatarResponse {
  avatarUrl: string;
}

@route("/api/users")
interface UsersRoutes {
  @get
  @route("/me")
  @useAuth(TypeSpec.Http.BearerAuth)
  getMe(): UserProfile;

  @delete
  @route("/me")
  @useAuth(TypeSpec.Http.BearerAuth)
  deleteMe(): SuccessResponse;

  @patch
  @route("/settings")
  @useAuth(TypeSpec.Http.BearerAuth)
  updateSettings(@body body: UpdateSettingsRequest): UserProfile;

  @patch
  @route("/email")
  @useAuth(TypeSpec.Http.BearerAuth)
  updateEmail(@body body: UpdateEmailRequest): UserProfile;

  @patch
  @route("/password")
  @useAuth(TypeSpec.Http.BearerAuth)
  updatePassword(@body body: UpdatePasswordRequest): SuccessResponse;

  @patch
  @route("/public")
  @useAuth(TypeSpec.Http.BearerAuth)
  updatePublic(@body body: UpdatePublicRequest): UserProfile;

  @patch
  @route("/preferences")
  @useAuth(TypeSpec.Http.BearerAuth)
  updatePreferences(@body body: UpdatePreferencesRequest): UserProfile;

  @post
  @route("/avatar")
  @useAuth(TypeSpec.Http.BearerAuth)
  uploadAvatar(@body body: UploadAvatarRequest): UploadAvatarResponse;

  @get
  @route("/photos")
  @useAuth(TypeSpec.Http.BearerAuth)
  getPhotos(
    @query page?: int32,
    @query limit?: int32,
  ): MeetProof[];

  @get
  @route("/search")
  @useAuth(TypeSpec.Http.BearerAuth)
  searchUsers(@query q?: string): UserSummary[];
}
