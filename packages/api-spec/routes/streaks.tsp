import "@typespec/http";

using TypeSpec.Http;

namespace StreakMeet.Streaks;

model StreakPartner extends UserRef {
  avatarUrl?: string | null;
}

enum StreakLifecycle {
  ACTIVE: "ACTIVE",
  DEAD: "DEAD",
  DEAD_FINAL: "DEAD_FINAL",
}

model StreakListItem {
  id: string;
  count: int32;
  lastMetDate?: string | null;
  timezone: string;
  lifecycle: StreakLifecycle;
  countAtDeath?: int32 | null;
  restoresLeft: int32;
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

model UpdateStreakPetRequest {
  petName: string;
}

model UpdateStreakPetResponse {
  id: string;
  petName: string;
}

model StreakPetProgress {
  points: int32;
  level: int32;
  pointsInLevel: int32;
  nextLevelPoints: int32;
  pointsToNextLevel: int32;
}

model StreakDailyTask {
  id: string;
  titleKey: string;
  points: int32;
  completed: boolean;
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

model RemoteSelfiePending extends RemoteSelfieRequest {
  sender?: UserSummary;
}

model StreakDetail {
  id: string;
  petName: string;
  count: int32;
  lastMetDate?: string | null;
  timezone: string;
  petProgress: StreakPetProgress;
  dailyTasks: StreakDailyTask[];
  lifecycle: StreakLifecycle;
  countAtDeath?: int32 | null;
  restoresLeft: int32;
  userA: StreakPartner;
  userB: StreakPartner;
  remoteSelfies?: RemoteSelfiePending[];
  streakDays?: StreakDetailDay[];
}

model RestoreStreakResponse {
  ok: true;
  count: int32;
  lifecycle: StreakLifecycle;
  restoresLeft: int32;
}

model RestartStreakResponse {
  ok: true;
  count: int32;
  lifecycle: StreakLifecycle;
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
  @route("/{partnerNickname}/restore")
  @useAuth(TypeSpec.Http.BearerAuth)
  restoreStreak(@path partnerNickname: string): RestoreStreakResponse;

  @post
  @route("/{partnerNickname}/restart")
  @useAuth(TypeSpec.Http.BearerAuth)
  restartStreak(@path partnerNickname: string): RestartStreakResponse;

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

  @patch
  @route("/{streakId}/pet")
  @useAuth(TypeSpec.Http.BearerAuth)
  updateStreakPet(
    @path streakId: string,
    @body body: UpdateStreakPetRequest,
  ): UpdateStreakPetResponse;

  @delete
  @route("/{streakId}")
  @useAuth(TypeSpec.Http.BearerAuth)
  deleteStreak(@path streakId: string): OkResponse;

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
