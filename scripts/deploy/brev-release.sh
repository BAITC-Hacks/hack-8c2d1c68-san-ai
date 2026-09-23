#!/usr/bin/env bash
# Installed on the server as /usr/local/bin/san-ai-deploy.
# Dedicated authorized_keys entry forces this command; stdin is a git archive.
set -Eeuo pipefail
umask 077
commit=${SSH_ORIGINAL_COMMAND:-}
[[ "$commit" =~ ^[0-9a-f]{40}$ ]] || { echo 'Expected a commit SHA' >&2; exit 1; }
base=/home/ubuntu/workspace
original="$base/san-ai"
current="$base/san-ai-current"
releases="$base/san-ai-releases"
export PATH="/home/ubuntu/.local/share/san-ai/node-v22.23.2-linux-x64/bin:$PATH"
export NEXT_TELEMETRY_DISABLED=1
mkdir -p "$releases"
exec 9>"$base/.san-ai-deploy.lock"
flock -w 600 9
release=$(mktemp -d "$releases/${commit}.XXXXXX")
archive=$(mktemp)
trap 'rm -f "$archive"' EXIT
cat > "$archive"
# Archives produced by git must stay within the new release directory.
python3 - "$archive" "$release" <<'PY'
import sys,tarfile,pathlib
with tarfile.open(sys.argv[1]) as t:
    for m in t.getmembers():
        p=pathlib.PurePosixPath(m.name)
        if p.is_absolute() or '..' in p.parts or not (m.isfile() or m.isdir()):
            raise SystemExit('Unsupported archive entry')
        if p.parts[0] in ('.data','.env','.env.local','.git'):
            raise SystemExit('Archive contains runtime state')
    t.extractall(sys.argv[2])
PY
cd "$release"
# Keep the existing database and server-only environment outside releases.
if [[ -f "$original/.env.local" ]]; then ln -s "$original/.env.local" .env.local; fi
npm ci
npm run build
ln -s "$original/.data" .data
printf '%s\n' "$commit" > .release-commit
previous=$(readlink -f "$current")
rollback() {
  trap - ERR INT TERM
  sudo systemctl stop san-ai
  ln -sfn "$previous" "$current.next"
  mv -Tf "$current.next" "$current"
  sudo systemctl start san-ai
  echo 'Deployment failed; previous release restored' >&2
  exit 1
}
trap rollback ERR INT TERM
sudo systemctl stop san-ai
ln -sfn "$release" "$current.next"
mv -Tf "$current.next" "$current"
sudo systemctl start san-ai
for attempt in $(seq 1 30); do
  if curl -fsS --max-time 3 http://127.0.0.1:3000/api/health | python3 -c 'import json,sys; assert json.load(sys.stdin)["status"] == "ok"'; then
    trap - ERR INT TERM
    echo "Deployed $commit"
    exit 0
  fi
  sleep 2
done
false # Trigger rollback after a failed health check.
