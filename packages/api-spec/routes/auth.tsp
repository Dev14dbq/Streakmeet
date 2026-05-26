import "@typespec/http";

using TypeSpec.Http;

namespace StreakMeet.Auth;

model CheckEmailRequest {
  email: string;
}

model CheckEmailResponse {
  exists: boolean;
}

model LoginRequest {
  email: string;
  password: string;
  timezone?: string;
}

model RegisterRequest {
  email: string;
  password: string;
  nickname: string;
  username: string;
  timezone?: string;
}

model GoogleAuthRequest {
  accessToken?: string;
  idToken?: string;
  timezone?: string;
}

model AppleAuthRequest {
  idToken: string;
  timezone?: string;
}

model RestoreAccountEmailRequest {
  email: string;
  password: string;
}

model RestoreAccountGoogleRequest {
  provider: "google";
  accessToken?: string;
  idToken?: string;
}

model RestoreAccountAppleRequest {
  provider: "apple";
  idToken: string;
}

alias RestoreAccountRequest =
  | RestoreAccountEmailRequest
  | RestoreAccountGoogleRequest
  | RestoreAccountAppleRequest;

model EnrollFaceRequest {
  photos: string[];
}

model EnrollFaceResponse {
  success: true;
}

@route("/api/auth")
interface AuthRoutes {
  @post
  @route("/check-email")
  checkEmail(@body body: CheckEmailRequest): CheckEmailResponse;

  @post
  @route("/login")
  login(@body body: LoginRequest): AuthResponse;

  @post
  @route("/register")
  register(@body body: RegisterRequest): AuthResponse;

  @post
  @route("/restore-account")
  restoreAccount(@body body: RestoreAccountRequest): AuthResponse;

  @post
  @route("/google")
  googleAuth(@body body: GoogleAuthRequest): AuthResponse;

  @post
  @route("/apple")
  appleAuth(@body body: AppleAuthRequest): AuthResponse;

  @post
  @route("/enroll-face")
  @useAuth(TypeSpec.Http.BearerAuth)
  enrollFace(@body body: EnrollFaceRequest): EnrollFaceResponse;
}
