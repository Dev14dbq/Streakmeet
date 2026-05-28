#!/usr/bin/env bash
# End-to-end smoke test for face enrollment + magic-meet API wiring.
set -euo pipefail

API="${API:-http://127.0.0.1:3000}"

FACE_IMG="${FACE_IMG:-}"
if [ -z "$FACE_IMG" ]; then
  FACE_IMG="$(cd /home/streakmeet/face-service && source .venv/bin/activate && python3 -c "import insightface, os; print(os.path.join(os.path.dirname(insightface.__file__), 'data', 'images', 't1.jpg'))")"
fi
if [ ! -f "$FACE_IMG" ]; then
  echo "SKIP: no test image"
  exit 0
fi

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

export FACE_IMG TMP
python3 <<'PY'
import base64, json, os
img = os.environ["FACE_IMG"]
out = os.environ["TMP"]
with open(img, "rb") as f:
    b64 = "data:image/jpeg;base64," + base64.b64encode(f.read()).decode()
open(os.path.join(out, "photo.txt"), "w").write(b64)
json.dump({"photos": [b64]*5}, open(os.path.join(out, "enroll.json"), "w"))
json.dump({"photosBase64": [b64]*3}, open(os.path.join(out, "meet.json"), "w"))
PY

NICK="smoke$(date +%s | tail -c 6)"
EMAIL="${NICK}@test.local"

echo "=== register $NICK ==="
REG=$(curl -sS -X POST "$API/api/auth/register" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"smoke123\",\"username\":\"$NICK\"}")
TOKEN=$(echo "$REG" | python3 -c "import sys,json; print(json.load(sys.stdin)['accessToken'])")

echo "=== enroll-face ==="
HTTP_CODE=$(curl -sS -o "$TMP/enroll_out.json" -w '%{http_code}' -X POST "$API/api/auth/enroll-face" \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d @"$TMP/enroll.json")
echo "HTTP $HTTP_CODE $(cat "$TMP/enroll_out.json")"
[ "$HTTP_CODE" = "200" ] || exit 1

echo "=== /users/me ==="
ME=$(curl -sS -H "Authorization: Bearer $TOKEN" "$API/api/users/me")
python3 -c "import json,sys; u=json.loads(sys.argv[1]); assert u['faceEnrolled']" "$ME"
echo "faceEnrolled=True"

echo "=== magic-meet burst ==="
HTTP_CODE=$(curl -sS -o "$TMP/meet_out.json" -w '%{http_code}' -X POST "$API/api/streaks/magic-meet" \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d @"$TMP/meet.json")
echo "HTTP $HTTP_CODE $(cat "$TMP/meet_out.json")"

echo "=== SMOKE OK ==="
