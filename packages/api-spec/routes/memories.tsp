import "@typespec/http";

using TypeSpec.Http;

namespace StreakMeet.Memories;

enum MemoryFeedItemKind {
  meet: "meet",
  milestone: "milestone",
}

model MemoryPartner {
  id: string;
  nickname: string;
  avatarUrl?: string | null;
}

model MemoryMeetItem {
  id: string;
  kind: MemoryFeedItemKind.meet;
  date: string;
  createdAt: utcDateTime;
  streakId: string;
  partner: MemoryPartner;
  photoUrl: string;
  uploadedBy: UserRef;
  latitude?: float64 | null;
  longitude?: float64 | null;
}

model MemoryMilestoneItem {
  id: string;
  kind: MemoryFeedItemKind.milestone;
  date: string;
  streakId: string;
  partner: MemoryPartner;
  milestoneDays: int32;
}

alias MemoryFeedItem = MemoryMeetItem | MemoryMilestoneItem;

model MemoriesFeedResponse {
  unlocked: boolean;
  daysUntilUnlock: int32;
  unlockAtDays: int32;
  page: int32;
  limit: int32;
  hasMore: boolean;
  milestones: MemoryMilestoneItem[];
  items: MemoryFeedItem[];
}

@route("/api/memories")
interface MemoriesRoutes {
  @get
  @useAuth(TypeSpec.Http.BearerAuth)
  getMemories(
    @query page?: int32,
    @query limit?: int32,
    @query streakId?: string,
  ): MemoriesFeedResponse;
}
