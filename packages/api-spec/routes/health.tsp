import "@typespec/http";

using TypeSpec.Http;

namespace StreakMeet.Health;

model HealthResponse {
  status: "ok";
  message: string;
}

@route("/health")
interface HealthRoutes {
  @get
  health(): HealthResponse;
}
