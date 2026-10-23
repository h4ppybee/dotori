# dotori 문서

프로젝트 설계·서비스 구조 문서 카탈로그. 코드를 바꿀 때 **관련 문서를 같은 작업에서 함께 갱신**한다(아래 규칙 참고).

## 문서 목록

| 문서 | 내용 | 언제 갱신하나 |
| --- | --- | --- |
| [architecture.md](architecture.md) | 전체 아키텍처 — 디렉토리 구조, 레이어·데이터 흐름, 보안 모델, 도메인 노트 | 라우트·`lib` 모듈·`components` 디렉토리·자산 종류·데이터 흐름·Dexie 테이블 변경 시 |
| [backup.md](backup.md) | 백업 내보내기/불러오기 — payload 형식, 포함·제외 대상, 정제·트랜잭션, 버전 | `lib/backup` 변경, 새 영속 테이블 추가, payload 버전 변경 시 |
| [external-api.md](external-api.md) | 외부 OpenAPI 연동 — 토스·업비트, 프록시·릴레이, 토큰/JWT, 정규화, 갱신 | `lib/{toss,upbit,sync}`·`app/api/*` 변경, 프록시/엔드포인트 추가 시 |
| [device-sync.md](device-sync.md) | 기기 동기화 — 범위·암호화·해시 판단·충돌·잠금 해제/갱신 순서 | `lib/device-sync`·`lib/apps-script`·Apps Script `sync.*` 변경 시 |
| [../DESIGN.md](../DESIGN.md) | 디자인 시스템 — 색·타이포·스페이싱·컴포넌트 규격·UX 라이팅 | UI 토큰·규칙 추가/변경 시 |
| [../AGENTS.md](../AGENTS.md) | 에이전트/기여자용 요약 가이드(핵심 규칙 진입점) | 위 문서와 연동해 요약이 어긋나면 |
| [superpowers/specs/](superpowers/specs/) · [superpowers/plans/](superpowers/plans/) | 기능별 설계 스펙·구현 플랜(작업 기록) | 새 기능 브레인스토밍/플랜 시 |

## 문서 동기화 규칙 (필수)

기능을 추가·변경할 때 문서를 코드와 어긋난 채로 남기지 않는다. 무엇을 만졌는지에 따라:

- **서비스 구조**(라우트·모듈·자산 종류·데이터 흐름) → [architecture.md](architecture.md)
- **백업**(`lib/backup`, 영속 데이터) → [backup.md](backup.md) + `lib/backup`
- **외부 연동**(`lib/{toss,upbit,sync}`, `app/api/*`) → [external-api.md](external-api.md)
- **기기 동기화**(`lib/device-sync`, 동기화 대상 테이블·필드) → [device-sync.md](device-sync.md)
- **UI/디자인**(토큰·컴포넌트 규격) → [../DESIGN.md](../DESIGN.md)

새 주제 영역이 생기면 이 폴더에 문서를 추가하고 위 표에 등록한다.
