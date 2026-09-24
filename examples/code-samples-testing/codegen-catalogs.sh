#!/usr/bin/env bash
# Replaces cases/<case>/catalogs.json with what codegen-v2's portal-artifacts endpoint returns for
# cases/<case>/src. Needs a codegen-v2 Functions host on $CODEGEN (default http://127.0.0.1:7071).
# usage: codegen-catalogs.sh <case-dir> <scratch-dir>
set -euo pipefail
CASE="$1"; SCRATCH="$2"; CODEGEN="${CODEGEN:-http://127.0.0.1:7071}"
mkdir -p "$SCRATCH"; rm -rf "$SCRATCH/src.zip" "$SCRATCH/artifacts" "$SCRATCH/artifacts.zip"
(cd "$CASE/src" && powershell.exe -NoProfile -Command "Compress-Archive -Path * -DestinationPath '$(cygpath -w "$SCRATCH/src.zip")'")
FEATURES=$(printf '{"BuildFeatures":{"Platforms":["CSharp","TypeScript","Python"],"Features":["OnPremPortalGeneration"]}}' | base64 -w0)
ID=$(curl -sf -X POST "$CODEGEN/api/portal-artifacts" -H "X-APIMatic-SubscriptionFeatures: $FEATURES" -F "file=@$SCRATCH/src.zip" |
  node -e "process.stdin.on('data', (d) => console.log(JSON.parse(d).id))")
until STATUS=$(curl -sf "$CODEGEN/api/portal-artifacts/$ID/status") && echo "$STATUS" | grep -qE '"(Completed|Failed|ValidationError|SubscriptionError)"'; do sleep 3; done
echo "$STATUS"
echo "$STATUS" | grep -q '"Completed"'
curl -sf -o "$SCRATCH/artifacts.zip" "$CODEGEN/api/portal-artifacts/$ID/download"
mkdir "$SCRATCH/artifacts" && unzip -q "$SCRATCH/artifacts.zip" -d "$SCRATCH/artifacts"
node -e "
const fs = require('fs');
const dir = process.argv[1] + '/code-samples';
const entries = ['csharp', 'typescript', 'python', 'java', 'php', 'ruby', 'go']
  .filter((l) => fs.existsSync(dir + '/' + l + '.json'))
  .map((l) => [l, JSON.parse(fs.readFileSync(dir + '/' + l + '.json', 'utf8'))]);
fs.writeFileSync(process.argv[2], JSON.stringify(entries, null, 2) + '\n');
console.log('catalogs:', entries.map(([l]) => l).join(', '));
" "$SCRATCH/artifacts" "$CASE/catalogs.json"
