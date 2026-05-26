import "@typespec/http";

using TypeSpec.Http;

namespace StreakMeet.Friends;

model FriendRequest {
  friendId: string;
}

model AcceptFriendRequest {
  friendshipId: string;
}

model FriendshipRecord {
  id: string;
  status: FriendshipStatus;
  userAId?: string;
  userBId?: string;
  createdAt?: utcDateTime;
}

model FriendListItem {
  id: string;
  status: FriendshipStatus;
  isIncomingRequest: boolean;
  friend: UserSummary;
}

@route("/api/friends")
interface FriendsRoutes {
  @get
  @route("/")
  @useAuth(TypeSpec.Http.BearerAuth)
  listFriends(): FriendListItem[];

  @post
  @route("/request")
  @useAuth(TypeSpec.Http.BearerAuth)
  requestFriend(@body body: FriendRequest): FriendshipRecord;

  @post
  @route("/accept")
  @useAuth(TypeSpec.Http.BearerAuth)
  acceptFriend(@body body: AcceptFriendRequest): FriendshipRecord;
}
