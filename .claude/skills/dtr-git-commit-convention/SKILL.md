---
name: dtr-git-commit-convention
description: Git 커밋 메시지를 작성하거나 커밋하도록 요청받았을 때 적용
---

# Git — 커밋 메시지

## 사용 시점

- 사용자가 커밋을 요청하거나, 커밋 메시지 초안을 만들 때
- 변경분을 스테이징한 뒤 `git commit` 할 때


## 규칙
- **Conventional Commits:** `feat:`, `fix:` 같은 **타입 접두어만 영어**로 두고, **콜론 뒤 설명은 한글**로 쓴다.
  예: `fix: 로그인 후 토큰 갱신 실패 시 재시도 처리`
  예: `feat: API prefix 설정 및 TypeScript 경로 별칭 적용`
- **본문:** 변경 내용·이유를 한글 불릿으로 간결하게 적는다.
- **본문 언어:** 커밋 **제목·본문은 한글**로 작성한다.
- **영어 허용:** 기술 고유명사·라이브러리·CLI·URL·경로·코드 식별자는 영어 그대로 사용한다.
  예: `NestJS`, `Vite`, `tsc-alias`, `@api/...`, `pnpm`, `Docker`, `PostgreSQL`
