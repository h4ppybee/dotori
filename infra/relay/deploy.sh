#!/usr/bin/env bash
# 릴레이 코드를 Oracle VM에 배포한다 (로컬에서 실행).
#
# 사용법:
#   RELAY_VM=ubuntu@138.2.52.151 infra/relay/deploy.sh
#
# 동작: 레포 소스를 rsync로 VM에 전송 → /opt/dotori 갱신 → relay 의존성 설치 →
#       systemd 재시작 → healthz 확인. (.env/비밀은 VM의 /etc/dotori-relay.env에만 둔다)
set -euo pipefail

VM="${RELAY_VM:?RELAY_VM=ubuntu@<공인IP> 형식으로 지정하세요}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

echo "→ 소스 전송: $VM"
rsync -az \
  --exclude 'node_modules' --exclude '.git' --exclude '.next' \
  --exclude '.env' --exclude '.env.local' \
  -e ssh "$ROOT/" "$VM:/tmp/dotori-src/"

echo "→ 배치 + 의존성 + 재시작"
ssh "$VM" 'set -e
  sudo cp -a /tmp/dotori-src/. /opt/dotori/
  sudo chown -R relay:relay /opt/dotori
  sudo rm -rf /tmp/dotori-src
  sudo -u relay bash -c "cd /opt/dotori/relay && npm ci"
  sudo systemctl restart dotori-relay
  sleep 2
  echo -n "healthz: "; curl -s localhost:8787/healthz; echo'

echo "✓ 배포 완료"
