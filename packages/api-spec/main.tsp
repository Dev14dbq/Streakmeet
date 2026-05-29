import "@typespec/http";
import "@typespec/rest";
import "@typespec/openapi3";

import "./models.tsp";
import "./routes/auth.tsp";
import "./routes/users.tsp";
import "./routes/friends.tsp";
import "./routes/streaks.tsp";
import "./routes/location.tsp";
import "./routes/legal.tsp";
import "./routes/public.tsp";
import "./routes/memories.tsp";
import "./routes/health.tsp";

using TypeSpec.Http;
using TypeSpec.OpenAPI;

@service(#{
  title: "StreakMeet API",
})
@server("http://localhost:3000", "Local development")
namespace StreakMeet {}
