#!/usr/bin/env bash
# Compiles the scene forge with nothing but a JDK on PATH (no Maven, Gradle or downloads).
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
classes="$here/build/classes"

command -v javac >/dev/null 2>&1 || {
  echo "javac not found: install a JDK 17+ to regenerate scene data." >&2
  exit 1
}

rm -rf "$classes"
mkdir -p "$classes"

mapfile -t sources < <(find "$here/src/main/java" -name '*.java' | sort)
javac -encoding UTF-8 -Xlint:all -Werror -d "$classes" "${sources[@]}"

echo "scene-forge: compiled ${#sources[@]} files into $classes"
