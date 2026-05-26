import "@typespec/http";

using TypeSpec.Http;

namespace StreakMeet.Public;

model PublicUser {
  id: string;
  nickname: string;
  avatarUrl?: string | null;
  isPublic?: boolean;
}

model PublicFriendshipSelf {
  status: "SELF";
}

model PublicFriendshipRelation {
  id: string;
  status: FriendshipStatus;
  isIncoming: boolean;
}

alias PublicFriendship = PublicFriendshipSelf | PublicFriendshipRelation | null;

model PublicProfile {
  user: PublicUser;
  friendship: PublicFriendship;
}

@route("/api/public")
interface PublicRoutes {
  @get
  @route("/users/{nickname}")
  getPublicProfile(@path nickname: string): PublicProfile;

  @get
  @route("/users/{nickname}/photos")
  getPublicPhotos(
    @path nickname: string,
    @query page?: int32,
    @query limit?: int32,
  ): MeetProof[];
}
