#!/usr/bin/env bash
# Compare Node (:3000) vs Rust (:8080) REST contract for login, friends, streaks.
# Requires both backends up and JWT_SECRET matching.
set -euo pipefail

NODE_API="${NODE_API:-http://127.0.0.1:3000}"
RUST_API="${RUST_API:-http://127.0.0.1:8080}"
DATABASE_URL="${DATABASE_URL:-}"
EMAIL="${CONTRACT_EMAIL:-}"
PASSWORD="${CONTRACT_PASSWORD:-contract123}"

if [ -z "$EMAIL" ]; then
  EMAIL="contract$(date +%s)@test.local"
  NICK="c$(date +%s | tail -c 8)"
  echo "=== register test user $EMAIL on Rust ==="
  curl -sS -f -X POST "$RUST_API/api/auth/register" \
    -H 'Content-Type: application/json' \
    -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\",\"username\":\"$NICK\"}" >/dev/null

  if [ -z "$DATABASE_URL" ] && [ -f /home/streakmeet/backend-rust/.env ]; then
    set -a
    # shellcheck disable=SC1091
    source /home/streakmeet/backend-rust/.env
    set +a
  fi
  if [ -n "$DATABASE_URL" ]; then
    echo "=== verify email for contract test user ==="
    psql "$DATABASE_URL" -c "UPDATE users SET \"emailVerifiedAt\" = NOW() WHERE email = '$EMAIL';" >/dev/null
  else
    echo "WARN: DATABASE_URL unset — protected routes may return 403"
  fi
fi

echo "=== login Rust ==="
RUST_LOGIN=$(curl -sS -f -X POST "$RUST_API/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}")
TOKEN=$(echo "$RUST_LOGIN" | python3 -c "import sys,json; print(json.load(sys.stdin)['accessToken'])")

echo "=== login Node (same credentials) ==="
NODE_LOGIN=$(curl -sS -f -X POST "$NODE_API/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}")
python3 -c "import sys,json; d=json.load(sys.stdin); assert 'accessToken' in d" <<<"$NODE_LOGIN"

compare_json() {
  local label="$1"
  local node_json="$2"
  local rust_json="$3"
  python3 - "$label" "$node_json" "$rust_json" <<'PY'
import json, sys

label, node_raw, rust_raw = sys.argv[1:4]
node = json.loads(node_raw)
rust = json.loads(rust_raw)

def normalize_friends(data):
    items = data if isinstance(data, list) else data.get("friends", data)
    out = []
    for item in sorted(items, key=lambda x: x.get("id", "")):
        friend = item.get("friend") or {}
        out.append({
            "id": item.get("id"),
            "status": item.get("status"),
            "isIncomingRequest": item.get("isIncomingRequest"),
            "friendId": friend.get("id"),
            "nickname": friend.get("nickname"),
        })
    return out

def normalize_streaks(data):
    items = data if isinstance(data, list) else data.get("streaks", data)
    out = []
    for item in sorted(items, key=lambda x: x.get("id", "")):
        partner = item.get("partner") or {}
        out.append({
            "id": item.get("id"),
            "count": item.get("count"),
            "lastMetDate": item.get("lastMetDate"),
            "timezone": item.get("timezone"),
            "partnerId": partner.get("id"),
            "partnerNickname": partner.get("nickname"),
        })
    return out

if label == "friends":
    n = normalize_friends(node)
    r = normalize_friends(rust)
elif label == "streaks":
    n = normalize_streaks(node)
    r = normalize_streaks(rust)
else:
    raise SystemExit(f"unknown label {label}")

if n != r:
    print(f"FAIL {label}:", file=sys.stderr)
    print("  node:", json.dumps(n, indent=2), file=sys.stderr)
    print("  rust:", json.dumps(r, indent=2), file=sys.stderr)
    raise SystemExit(1)
print(f"OK {label}: {len(n)} items match")
PY
}

echo "=== friends list (same JWT) ==="
NODE_FRIENDS=$(curl -sS -f -H "Authorization: Bearer $TOKEN" "$NODE_API/api/friends/")
RUST_FRIENDS=$(curl -sS -f -H "Authorization: Bearer $TOKEN" "$RUST_API/api/friends/")
compare_json friends "$NODE_FRIENDS" "$RUST_FRIENDS"

echo "=== streaks list (same JWT) ==="
NODE_STREAKS=$(curl -sS -f -H "Authorization: Bearer $TOKEN" "$NODE_API/api/streaks/")
RUST_STREAKS=$(curl -sS -f -H "Authorization: Bearer $TOKEN" "$RUST_API/api/streaks/")
compare_json streaks "$NODE_STREAKS" "$RUST_STREAKS"

echo "=== CONTRACT PARITY OK ==="
