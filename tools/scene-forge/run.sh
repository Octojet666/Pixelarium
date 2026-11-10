#!/usr/bin/env bash
# Runs the scene forge, compiling first if the classes are missing or stale.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
classes="$here/build/classes"

needs_build=0
if [ ! -d "$classes" ]; then
  needs_build=1
elif [ -n "$(find "$here/src/main/java" -name '*.java' -newer "$classes" -print -quit)" ]; then
  needs_build=1
fi

if [ "$needs_build" -eq 1 ]; then
  bash "$here/build.sh"
fi

exec java -cp "$classes" studio.pixelarium.forge.Main "$@"
