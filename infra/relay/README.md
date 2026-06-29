# 토스 릴레이 서버 — Oracle VM 셋업 런북

dotori 프론트는 Vercel(동적 IP)에 있고, 토스는 IP 화이트리스트(정책상 해제 불가)를 요구한다.
그래서 **고정 공인 IP를 가진 단일 VM**에 Fastify 릴레이를 띄우고, 그 IP만 토스에 등록한다.

- 호스트: Oracle Cloud Free Tier (영구 무료, 단일 VM → 아웃바운드 IP가 그 VM 공인 IP로 고정)
- TLS: 도메인이 없으므로 `nip.io` + Caddy 자동 인증서
- 실행: systemd로 저권한 유저(relay) 아래 tsx 직접 실행

> 아래는 **Ubuntu LTS** 기준이다. Oracle Linux를 고르면 `ufw` 대신 firewalld/iptables를 써야 하고 기본 차단 정책이 다르니 주의.

---

## 0. 사전 준비
- Oracle Cloud 계정 (Free Tier)
- 로컬에 SSH 키쌍 (`ssh-keygen -t ed25519`)
- 토스 콘솔 접근 권한 (IP 등록용)
- 이 레포(`relay/`) 코드

## 1. VM 생성 + 고정 공인 IP
1. Compute → Instances → Create.
2. Image: **Ubuntu 22.04/24.04 LTS**. Shape: Free 한도 내(Ampere `VM.Standard.A1.Flex` 권장 또는 `E2.1.Micro`).
3. SSH 공개키 등록.
4. 생성 후 **Reserved Public IP**를 할당(임시 IP는 재부팅 시 바뀔 수 있으므로 예약 IP로 고정).
5. 이 공인 IP를 메모(이하 `RELAY_IP`).

## 2. 클라우드 방화벽 (VCN Security List 또는 NSG)
인그레스 규칙만 최소로 연다:
- **22/tcp**: 내 사무실/집 IP만 (Source CIDR을 내 IP/32로)
- **80/tcp**: 0.0.0.0/0 (Let's Encrypt HTTP-01 챌린지)
- **443/tcp**: 0.0.0.0/0 (릴레이 HTTPS)

> 8787(Fastify)은 **외부에 절대 열지 않는다.** Caddy가 localhost로만 프록시한다.

## 3. 접속 + 기본 업데이트
```bash
ssh ubuntu@RELAY_IP
sudo apt update && sudo apt -y upgrade
```

## 4. OS 방화벽 (iptables) — 클라우드 방화벽과 이중 방어
> Oracle Ubuntu 이미지는 기본 iptables 규칙(22만 허용, 나머지 REJECT)과 `InstanceServices`
> 체인(메타데이터/부팅 필수)을 갖고 있다. `ufw`를 켜면 충돌하기 쉬우므로 **기존 iptables에
> 80/443만 추가**하고 영속화한다.
```bash
# 기존 REJECT 규칙(보통 5번) 앞에 80/443 NEW 허용 삽입
sudo iptables -I INPUT 5 -p tcp -m state --state NEW --dport 80 -j ACCEPT
sudo iptables -I INPUT 6 -p tcp -m state --state NEW --dport 443 -j ACCEPT
# 영속화 (재부팅 복원)
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y iptables-persistent
sudo netfilter-persistent save
sudo iptables -L INPUT -n --line-numbers   # 22/80/443 ACCEPT 후 REJECT 인지 확인
```
> 클라우드 쪽(VCN Security List)에도 80·443 인그레스를 반드시 추가해야 외부에서 닿는다(§2).

## 5. SSH 하드닝
`/etc/ssh/sshd_config`(또는 `/etc/ssh/sshd_config.d/99-hardening.conf`):
```
PasswordAuthentication no
PermitRootLogin no
PubkeyAuthentication yes
```
```bash
sudo systemctl restart ssh
```
> 키 접속이 되는 걸 확인한 **다음에** 비번 로그인을 끈다(잠기지 않도록).

## 6. fail2ban (SSH 무차별 차단)
```bash
sudo apt -y install fail2ban
sudo systemctl enable --now fail2ban
```

## 7. 자동 보안 패치
```bash
sudo apt -y install unattended-upgrades
sudo dpkg-reconfigure --priority=low unattended-upgrades
```

## 8. Node 22 + 전용 유저
```bash
# Node 22 (nodesource)
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt -y install nodejs

# 저권한 유저 (로그인 셸 없음)
sudo useradd --system --create-home --shell /usr/sbin/nologin relay
```

## 9. 코드 배치 + 의존성
```bash
sudo mkdir -p /opt/dotori
sudo chown relay:relay /opt/dotori
# 레포를 /opt/dotori 로 클론(또는 relay/ 산출물만 전송)
sudo -u relay git clone <REPO_URL> /opt/dotori
cd /opt/dotori/relay
sudo -u relay npm ci   # 또는 npm install
```
> tsx가 `toss-client`를 상대경로(`../../lib/...`)로 import하므로 **레포 전체**가 있어야 한다(relay/만 떼어오면 안 됨).

## 10. 환경변수 파일
```bash
sudo cp /opt/dotori/relay/../infra/relay/dotori-relay.env.example /etc/dotori-relay.env
sudo nano /etc/dotori-relay.env   # RELAY_SECRET, RELAY_DOMAIN 등 채우기
sudo chown root:relay /etc/dotori-relay.env
sudo chmod 640 /etc/dotori-relay.env
```
- `RELAY_SECRET`: `openssl rand -hex 24` 로 생성. **Vercel의 `NEXT_PUBLIC_RELAY_SECRET`과 동일하게.**
- `RELAY_DOMAIN`: `RELAY_IP.nip.io` (예: `203.0.113.5.nip.io`)
- `ALLOWED_ORIGINS`: `https://dotori-h4ppy-bee.vercel.app`

## 11. systemd 유닛
```bash
sudo cp /opt/dotori/infra/relay/dotori-relay.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now dotori-relay
sudo systemctl status dotori-relay
# 로컬 확인 (시크릿 없이 healthz는 200)
curl -s localhost:8787/healthz
```

## 12. Caddy (HTTPS 종단)
```bash
sudo apt -y install debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt -y install caddy

# Caddyfile 배치
sudo cp /opt/dotori/infra/relay/Caddyfile /etc/caddy/Caddyfile
# Caddy 프로세스에 RELAY_DOMAIN 주입 (override)
sudo systemctl edit caddy
#   [Service]
#   Environment=RELAY_DOMAIN=203.0.113.5.nip.io
sudo systemctl restart caddy
```
검증:
```bash
curl -s https://RELAY_IP.nip.io/healthz   # {"ok":true}
```

## 13. 다음 단계 (Task 10)
1. **토스 콘솔에 `RELAY_IP` 등록** (아웃바운드 IP 화이트리스트).
2. **Vercel 환경변수** (Production):
   - `NEXT_PUBLIC_RELAY_URL=https://RELAY_IP.nip.io`
   - `NEXT_PUBLIC_RELAY_SECRET=<RELAY_SECRET과 동일>`
3. `main` 머지 → 프로덕션 재배포 → 동기화 검증.

---

## 업데이트 배포
private 레포라 git pull 대신 **로컬에서 rsync로 전송**한다. 배포 스크립트로 한 번에:
```bash
# 로컬(레포 루트)에서
RELAY_VM=ubuntu@<공인IP> infra/relay/deploy.sh
```
스크립트가 소스 rsync → `/opt/dotori` 갱신 → `npm ci` → `systemctl restart dotori-relay` → healthz 확인까지 수행한다. 수동으로 하려면:
```bash
# 로컬
rsync -az --exclude node_modules --exclude .git --exclude '.env*' ./ ubuntu@<IP>:/tmp/dotori-src/
# VM
sudo cp -a /tmp/dotori-src/. /opt/dotori/ && sudo chown -R relay:relay /opt/dotori
sudo -u relay bash -c 'cd /opt/dotori/relay && npm ci'
sudo systemctl restart dotori-relay
```

## 트러블슈팅
- **헬스 200, 동기화 401(토스)**: 토스 IP 등록 누락 또는 IP 변경 → `curl ifconfig.me`로 VM 아웃바운드 IP 확인 후 재등록.
- **브라우저 CORS 에러**: `ALLOWED_ORIGINS`/프리뷰 정규식과 실제 도메인 불일치.
- **릴레이 401**: `NEXT_PUBLIC_RELAY_SECRET`(Vercel) ≠ `RELAY_SECRET`(VM).
- **TLS 발급 실패**: 80 포트 차단(클라우드 Security List 또는 OS iptables) 또는 nip.io 도메인 오타.
