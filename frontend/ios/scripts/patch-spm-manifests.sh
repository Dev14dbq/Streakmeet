#!/usr/bin/env bash
# Patches third-party Package.swift manifest deprecations in Xcode DerivedData.
# Re-run after `xcodebuild -resolvePackageDependencies` or when SPM checkouts refresh.

set -euo pipefail

patch_google_sign_in() {
  local file="$1"
  [[ -f "$file" ]] || return 0

  if grep -q 'package(url: "https://github.com/openid/AppAuth-iOS.git"' "$file"; then
    return 0
  fi

  chmod u+w "$file" 2>/dev/null || true

  python3 - "$file" <<'PY'
from pathlib import Path
import sys

path = Path(sys.argv[1])
text = path.read_text()
old = """  dependencies: [
    .package(
      name: "AppAuth",
      url: "https://github.com/openid/AppAuth-iOS.git",
      from: "2.0.0"),
    .package(
      name: "AppCheck",
      url: "https://github.com/google/app-check.git",
      from: "11.0.0"),
    .package(
      name: "GTMAppAuth",
      url: "https://github.com/google/GTMAppAuth.git",
      from: "5.0.0"),
    .package(
      name: "GTMSessionFetcher",
      url: "https://github.com/google/gtm-session-fetcher.git",
      from: "3.3.0"),
    .package(
      name: "OCMock",
      url: "https://github.com/firebase/ocmock.git",
      .revision("7291762d3551c5c7e31c49cce40a0e391a52e889")),
    .package(
      name: "GoogleUtilities",
      url: "https://github.com/google/GoogleUtilities.git",
      from: "8.0.0"),
  ],"""
new = """  dependencies: [
    .package(url: "https://github.com/openid/AppAuth-iOS.git", from: "2.0.0"),
    .package(url: "https://github.com/google/app-check.git", from: "11.0.0"),
    .package(url: "https://github.com/google/GTMAppAuth.git", from: "5.0.0"),
    .package(url: "https://github.com/google/gtm-session-fetcher.git", from: "3.3.0"),
    .package(
      url: "https://github.com/firebase/ocmock.git",
      revision: "7291762d3551c5c7e31c49cce40a0e391a52e889"),
    .package(url: "https://github.com/google/GoogleUtilities.git", from: "8.0.0"),
  ],"""
if old not in text:
    sys.exit(0)
text = text.replace(old, new, 1)
text = text.replace('package: "AppAuth"', 'package: "AppAuth-iOS"')
text = text.replace('package: "AppCheck"', 'package: "app-check"')
text = text.replace('package: "GTMSessionFetcher"', 'package: "gtm-session-fetcher"')
path.write_text(text)
print(f"Patched GoogleSignIn Package.swift: {path}")
PY
}

found=0
while IFS= read -r -d '' file; do
  patch_google_sign_in "$file"
  found=1
done < <(find "$HOME/Library/Developer/Xcode/DerivedData" -path '*/SourcePackages/checkouts/GoogleSignIn-iOS/Package.swift' -print0 2>/dev/null)

if [[ "$found" -eq 0 ]]; then
  echo "GoogleSignIn checkout not found yet — open/build the iOS project in Xcode once, then re-run this script."
fi
