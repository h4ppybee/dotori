---
name: dtr-deploy
description: dotori에서 기능 작업을 배포 흐름에 태울 때 적용 — 큰 작업은 worktree에서 작업해 PR을 만들어 Vercel 프리뷰로 검토하고, 사용자가 원하면 main에 즉시 머지해 프로덕션 배포한다. "배포", "PR 만들어", "프리뷰", "main에 반영" 요청에 발동.
---

# dotori 배포 / CI·CD 워크플로우

## 사용 시점

- 한 화면·기능 이상을 건드리는 **큰 작업**을 시작할 때 (격리된 worktree에서 작업할 가치가 있을 때)
- 사용자가 "배포", "PR 만들어줘", "프리뷰 확인", "main에 반영" 등을 요청할 때
- 작업이 끝나 변경분을 어떻게 통합할지 정해야 할 때

## 배포 모델 (전제)

GitHub `h4ppybee/dotori` ↔ Vercel 프로젝트는 **Git 연동**되어 있다. 따라서:

- `main`에 push → **프로덕션 자동배포**
- 그 외 브랜치 push / PR → **프리뷰 자동배포** (PR에 Preview URL 코멘트가 달림)
- 모든 push에서 GitHub Actions(`.github/workflows/ci.yml`)가 `typecheck · lint · test`를 검증

즉 배포 자체는 Vercel이 처리한다. 이 스킬은 **무엇을 어디로 push할지**를 다룬다.

## 첫 단계: 경로 확인 (필수)

작업을 시작하거나 통합하기 전에 **사용자에게 반드시 확인한다**:

> "PR 프리뷰로 검토 후 머지할까요, 아니면 main에 바로 반영해서 즉시 배포할까요?"

답에 따라 아래 (A) 또는 (B)로 간다. 사용자가 명시적으로 즉시 배포를 원할 때만 (B)를 쓴다. 기본은 (A).

## (A) PR 프리뷰 경로 (기본)

1. **worktree 생성** — `superpowers:using-git-worktrees` 스킬로 격리된 worktree에서 작업한다. (이미 worktree 안이면 그대로 진행)
2. **작업 + 검증** — 변경 후 반드시 통과시킨다:
   ```bash
   npm run typecheck && npm run lint && npm test
   ```
3. **커밋** — `dtr-git-commit-convention` 스킬 규칙으로 커밋한다.
4. **push + PR 생성** — 브랜치를 push하고 PR을 만든다 (gh CLI 사용):
   ```bash
   git push -u origin <branch>
   gh pr create --fill --base main
   ```
   - `gh`가 인증 안 돼 있으면 `gh auth login` 안내.
   - `--fill`은 커밋 메시지로 제목·본문을 채운다. 필요하면 `--title`/`--body`로 직접 지정한다.
5. **프리뷰 검토** — Vercel이 PR에 단 **Preview URL**을 사용자에게 안내한다 (`gh pr view --web` 또는 PR 코멘트). CI 체크가 초록인지 확인한다.
6. **머지** — 사용자 승인 후 머지하면 `main` 프로덕션 자동배포:
   ```bash
   gh pr merge --squash --delete-branch
   ```
7. **정리** — worktree는 `superpowers:using-git-worktrees`의 정리 절차(또는 `ExitWorktree`)로 제거한다.

## (B) 즉시 배포 경로 (사용자가 명시적으로 원할 때만)

1. 검증을 먼저 통과시킨다: `npm run typecheck && npm run lint && npm test`
2. `main`에 직접 커밋(`dtr-git-commit-convention`)하고 push → 프로덕션 자동배포.
   - 작업 중이던 worktree/브랜치가 있으면 `--no-ff` 또는 squash로 `main`에 머지 후 push.
3. 배포 후 프로덕션 URL을 사용자에게 안내한다.

## 규칙

- **검증 게이트는 생략 금지.** push 전 `typecheck · lint · test`가 모두 통과해야 한다.
- **즉시 배포(B)는 사용자가 명시적으로 요청할 때만.** 기본 경로는 PR 프리뷰(A)다.
- 커밋 메시지는 항상 `dtr-git-commit-convention`을 따른다.
- worktree 작업은 `superpowers:using-git-worktrees`에 위임한다 — 이 스킬에서 worktree 생성/정리 절차를 재구현하지 않는다.
- 시크릿(토스 토큰 등)은 코드/PR에 넣지 않는다. Vercel 환경변수는 대시보드에서 관리한다.
