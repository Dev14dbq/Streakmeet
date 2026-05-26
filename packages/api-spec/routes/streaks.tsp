import "@typespec/http";

using TypeSpec.Http;

namespace StreakMeet.Streaks;

model StreakPartner {
  id: string;
  nickname: string;
  avatarUrl?: string | null;
}

model StreakListItem {
  id: string;
  count: int32;
  lastMetDate?: string | null;
  timezone: string;
  partner: StreakPartner;
}

model CreateStreakRequest {
  partnerId: string;
}

model StreakRecord {
  id: string;
  userAId: string;
  userBId: string;
  count: int32;
  lastMetDate?: string | null;
  active?: boolean;
  timezone?: string;
}

model MagicMeetLocation {
  lat: float64;
  lng: float64;
}

model MagicMeetRequest {
  photoBase64: string;
  location?: MagicMeetLocation;
}

model MagicMeetPartner {
  nickname: string;
  avatarUrl?: string | null;
}

model MagicMeetResponse {
  message: string;
  partners: MagicMeetPartner[];
}

model RemoteSelfieInitRequest {
  photoBase64: string;
}

model RemoteSelfieRequest {
  id: string;
  streakId: string;
  senderId: string;
  receiverId: string;
  senderPhotoUrl: string;
  status: string;
  createdAt?: utcDateTime;
}

model RemoteSelfieReplyRequest {
  photoBase64: string;
}

model RemoteSelfieReplyResponse {
  success: true;
  photoUrl: string;
}

model RemindStreakResponse {
  ok: true;
}

model StreakDetailMeetProof {
  id: string;
  photoUrl: string;
  photoHash?: string;
  uploadedBy: MeetProofUploader;
}

model StreakDetailDay {
  id: string;
  date: string;
  status: StreakDayStatus;
  meetProofs: StreakDetailMeetProof[];
}

model RemoteSelfiePending {
  id: string;
  streakId: string;
  senderId: string;
  receiverId: string;
  senderPhotoUrl: string;
  status: string;
  createdAt?: utcDateTime;
  sender?: UserSummary;
}

model StreakDetail {
  id: string;
  count: int32;
  lastMetDate?: string | null;
  timezone: string;
  userA: StreakPartner;
  userB: StreakPartner;
  remoteSelfies?: RemoteSelfiePending[];
  streakDays?: StreakDetailDay[];
}

@route("/api/streaks")
interface StreaksRoutes {
  @get
  @route("/")
  @useAuth(TypeSpec.Http.BearerAuth)
  listStreaks(): StreakListItem[];

  @post
  @route("/")
  @useAuth(TypeSpec.Http.BearerAuth)
  createStreak(@body body: CreateStreakRequest): StreakRecord;

  @post
  @route("/magic-meet")
  @useAuth(TypeSpec.Http.BearerAuth)
  magicMeet(@body body: MagicMeetRequest): MagicMeetResponse;

  @post
  @route("/{partnerNickname}/remind")
  @useAuth(TypeSpec.Http.BearerAuth)
  remindStreak(@path partnerNickname: string): RemindStreakResponse;

  @get
  @route("/{partnerNickname}")
  @useAuth(TypeSpec.Http.BearerAuth)
  getStreak(
    @path partnerNickname: string,
    @query page?: int32,
    @query limit?: int32,
  ): StreakDetail;

  @post
  @route("/{streakId}/remote-selfie/init")
  @useAuth(TypeSpec.Http.BearerAuth)
  initRemoteSelfie(
    @path streakId: string,
    @body body: RemoteSelfieInitRequest,
  ): RemoteSelfieRequest;

  @post
  @route("/{streakId}/remote-selfie/reply/{requestId}")
  @useAuth(TypeSpec.Http.BearerAuth)
  replyRemoteSelfie(
    @path streakId: string,
    @path requestId: string,
    @body body: RemoteSelfieReplyRequest,
  ): RemoteSelfieReplyResponse;
}
