"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { TabDef } from "@/lib/nav/nav-config";
import { useNavStore } from "@/stores/nav-store";

// ← 복귀 시 접힘(160ms)이 거의 끝난 뒤 이동한다.
const BACK_NAV_DELAY_MS = 140;

// 펼침/접힘 타이밍. 펼침은 원이 떠오른 직후 시작(감속), 접힘은 즉시 시작(가속)해 빠릿하게.
const EXPAND = "duration-[260ms] delay-[120ms] ease-[cubic-bezier(0.22,1,0.36,1)]";
const COLLAPSE = "duration-[160ms] delay-0 ease-[cubic-bezier(0.4,0,1,1)]";

/**
 * 중첩 네비게이션 — 둥근 플로팅 바(pill). 자산·계획·가계부 공용(중첩 경로에서만 떠오른다).
 * 토스 증권의 플로팅 nested 바와 동일한 UX: 진입하면 메인 탭 바는 사라지고 이 pill만
 * 하단에 살짝 띄워 표시된다(좌우 여백 + shadow-floating). ←로 직전 메인 탭에 복귀한다.
 * 표시할 서브탭(tabs)과 활성 키(activeKey)는 부모(AppNav)가 경로에 맞춰 주입한다.
 * 항상 마운트하고 visible만 토글해 등장·사라짐 양방향 애니메이션을 만든다(inert로 차단).
 * 모션(메인 바와 순차 연출, 지연값은 MainTabBar와 맞물림):
 * - 등장: 메인 바가 내려가는 동안 ← 원(56px)이 떠오르고, 이어 pill이 왼→오로 펼쳐진다.
 * - 사라짐: 역순 — pill이 오→왼으로 원까지 접히고, 원이 내려간 뒤 메인 바가 올라온다.
 * 펼침은 배경 레이어 width(그림자 유지) + 내용물 clip-path를 같은 타이밍으로 맞춘다.
 * ← 복귀는 누르는 즉시 접기 시작하고 접힘이 끝난 뒤 이동한다. width·clip-path는 메인 스레드
 * 애니메이션이라, 경로 변경과 동시에 시작하면 새 화면 렌더에 프레임을 빼앗겨 접힘이 안 보인다.
 * 활성 표시는 낙관적: 탭을 누르는 즉시 옮기고, 실제 경로가 바뀌면 경로 기준으로 되돌린다.
 */
export function NestedTabBar({
  visible: visibleProp,
  tabs,
  activeKey: activeKeyProp,
}: {
  visible: boolean;
  tabs: TabDef[];
  activeKey: string | null;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const lastMainTabPath = useNavStore((s) => s.lastMainTabPath);

  // 탭을 누른 직후 ~ 경로 변경 완료 사이에만 유효한 낙관적 활성 키.
  // 경로가 실제로 바뀌면 렌더 중 상태 보정 패턴으로 폐기한다.
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  // ← 를 누른 뒤 경로가 바뀌기 전까지 미리 접어 두는 상태. 경로가 바뀌면 함께 폐기한다.
  const [closing, setClosing] = useState(false);
  const [prevPathname, setPrevPathname] = useState(pathname);
  if (pathname !== prevPathname) {
    setPrevPathname(pathname);
    setPendingKey(null);
    setClosing(false);
  }

  const backTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return () => {
      if (backTimer.current) {
        clearTimeout(backTimer.current);
      }
    };
  }, []);

  const visible = visibleProp && !closing;
  const activeKey = pendingKey ?? activeKeyProp;

  const goBack = () => {
    const href = lastMainTabPath || "/";
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) {
      router.push(href);
      return;
    }
    setClosing(true);
    backTimer.current = setTimeout(() => router.push(href), BACK_NAV_DELAY_MS);
  };

  return (
    <>
      {/* 하단 페이드 — 플로팅 pill 뒤로 비치는 스크롤 컨텐츠를 캔버스 색으로 자연스럽게 가린다.
          높이는 pill 상단(safe-area + 12px 띄움 + 56px 높이)까지만 덮도록 safe-area를 반영한다. */}
      <div
        aria-hidden
        className={`pointer-events-none fixed inset-x-0 bottom-0 z-40 bg-gradient-to-t from-canvas via-canvas/85 to-transparent transition-opacity motion-reduce:transition-none ${
          visible ? "opacity-100 duration-[200ms] delay-[60ms] ease-out" : "opacity-0 duration-[160ms] delay-[110ms] ease-in"
        }`}
        style={{ height: "calc(env(safe-area-inset-bottom) + 72px)" }}
      />
      <div
        aria-hidden={visible ? undefined : true}
        inert={!visible ? true : undefined}
        className={`fixed inset-x-0 z-50 transition-[translate,opacity] motion-reduce:transition-none ${
          visible
            ? "translate-y-0 opacity-100 duration-[160ms] delay-[60ms] ease-out"
            : "translate-y-[150%] opacity-0 pointer-events-none duration-[120ms] delay-[110ms] ease-in"
        }`}
        style={{ bottom: "calc(env(safe-area-inset-bottom) + 12px)" }}
      >
        <div className="mx-auto w-full max-w-[480px] px-4">
          <div className="relative h-[56px]">
            {/* 배경 레이어 — width로 펼쳐 둥근 모서리·그림자를 유지한다. 접힘 = ← 원(56px) */}
            <div
              aria-hidden
              className={`absolute inset-y-0 left-0 rounded-pill bg-surface-card shadow-floating transition-[width] motion-reduce:transition-none ${
                visible ? `w-full ${EXPAND}` : `w-14 ${COLLAPSE}`
              }`}
            />
            {/* 내용물 — 배경과 같은 타이밍으로 오른쪽을 잘라 함께 펼쳐지게 한다 */}
            <ul
              className={`relative flex h-full items-center gap-1 pl-2 pr-3 transition-[clip-path] motion-reduce:transition-none ${
                visible ? `[clip-path:inset(0)] ${EXPAND}` : `[clip-path:inset(0_calc(100%_-_56px)_0_0)] ${COLLAPSE}`
              }`}
            >
              <li className="shrink-0">
                <button
                  type="button"
                  aria-label="이전"
                  tabIndex={visible ? 0 : -1}
                  onClick={goBack}
                  className="flex h-11 w-11 items-center justify-center rounded-full text-muted transition-colors active:bg-surface-soft"
                >
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M15 5l-7 7 7 7" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </li>
              {tabs.map((tab) => {
                const active = tab.key === activeKey;
                return (
                  <li key={tab.key} className="flex-1">
                    <Link
                      href={tab.href}
                      tabIndex={visible ? 0 : -1}
                      onClick={() => setPendingKey(tab.key)}
                      aria-current={active ? "page" : undefined}
                      className={`flex h-[52px] flex-col items-center justify-center gap-[2px] rounded-full transition-colors ${
                        active ? "font-bold text-ink" : "font-semibold text-muted"
                      }`}
                    >
                      {tab.icon?.(active)}
                      <span className="text-[11px] leading-none whitespace-nowrap">{tab.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </div>
    </>
  );
}
