import "@typespec/http";

using TypeSpec.Http;

namespace StreakMeet.Location;

model MyLocationState {
  sharingLocation: boolean;
  latitude: float64 | null;
  longitude: float64 | null;
  updatedAt: utcDateTime | null;
}

model FriendLocation {
  id: string;
  nickname: string;
  avatarUrl: string | null;
  latitude: float64;
  longitude: float64;
  updatedAt: utcDateTime;
}

model SetLocationSharingRequest {
  enabled: boolean;
}

model UpdateLocationRequest {
  latitude: float64;
  longitude: float64;
}

model UpdateLocationResponse {
  ok: true;
  id: string;
  nickname: string;
  avatarUrl: string | null;
  latitude: float64;
  longitude: float64;
  updatedAt: utcDateTime;
}

@route("/api/location")
interface LocationRoutes {
  @get
  @route("/me")
  @useAuth(TypeSpec.Http.BearerAuth)
  getMyLocation(): MyLocationState;

  @get
  @route("/friends")
  @useAuth(TypeSpec.Http.BearerAuth)
  getFriendLocations(): FriendLocation[];

  @post
  @route("/sharing")
  @useAuth(TypeSpec.Http.BearerAuth)
  setLocationSharing(@body body: SetLocationSharingRequest): MyLocationState;

  @post
  @route("/update")
  @useAuth(TypeSpec.Http.BearerAuth)
  updateMyLocation(@body body: UpdateLocationRequest): UpdateLocationResponse;
}
