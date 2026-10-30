"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { mainTabs, nestedSections } from "@/lib/nav/nav-config";
import { resolveActiveMain } from "@/lib/nav/active";
import { useNavStore } from "@/stores/nav-store";

/**
 * 메인 하단 탭(5개). 고정 하단, surface-card 배경, active=ink/inactive=muted.
 * 중첩 섹션(자산·계획·가계부) 진입 시 직전 메인 탭 경로를 저장해 중첩 바 ← 복귀에 사용한다.
 * visible=false(중첩 경로)면 아래로 슬라이드되어 사라지고, 그 자리에 플로팅 중첩 바가 뜬다.
 * 순차 연출: 숨김은 지연 없이 빠르게 내려가고(이어서 중첩 바가 펼쳐짐), 노출은 중첩 바가
 * 접혀 내려간 뒤 올라온다. 지연값은 NestedTabBar 모션과 맞물린다.
 * 항상 마운트하고 transform/opacity만 토글해 양방향 애니메이션을 만든다(inert로 차단).
 * 활성 표시는 낙관적: 탭을 누르는 즉시 옮기고, 실제 경로가 바뀌면 경로 기준으로 되돌린다.
 * (라우트 전환이 끝나야 usePathname이 바뀌므로, 그동안의 무반응 구간을 없앤다.)
 */
export function MainTabBar({ visible = true }: { visible?: boolean }) {
  const pathname = usePathname();
  const setLastMainTab = useNavStore((s) => s.setLastMainTab);

  // 탭을 누른 직후 ~ 경로 변경 완료 사이에만 유효한 낙관적 활성 키.
  // 경로가 실제로 바뀌면 렌더 중 상태 보정 패턴으로 폐기한다.
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [prevPathname, setPrevPathname] = useState(pathname);
  if (pathname !== prevPathname) {
    setPrevPathname(pathname);
    setPendingKey(null);
  }

  const activeKey = pendingKey ?? resolveActiveMain(pathname);

  return (
    <nav
      aria-hidden={visible ? undefined : true}
      inert={!visible ? true : undefined}
      className={`fixed bottom-0 inset-x-0 z-40 bg-surface-card border-t border-hairline transition-[translate,opacity] motion-reduce:transition-none ${
        visible
          ? "translate-y-0 opacity-100 duration-[200ms] delay-[150ms] ease-out"
          : "translate-y-full opacity-0 pointer-events-none duration-[140ms] ease-in"
      }`}
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      aria-label="주요 화면"
    >
      <ul className="mx-auto flex w-full max-w-[480px] items-stretch">
        {mainTabs.map((tab) => {
          const active = tab.key === activeKey;
          const onClick = () => {
            // 누르는 즉시 활성 표시를 옮긴다 (경로 변경 완료를 기다리지 않음)
            setPendingKey(tab.key);
            // 중첩 섹션(자산·계획·가계부)으로 진입할 때, 현재가 그 섹션 경로가 아니면 복귀 지점으로 기록
            const section = nestedSections.find((s) => s.key === tab.key);
            if (section && !section.match(pathname)) {
              setLastMainTab(pathname);
            }
          };
          return (
            <li key={tab.key} className="flex-1">
              <Link
                href={tab.href}
                onClick={onClick}
                aria-current={active ? "page" : undefined}
                className={`flex h-[56px] flex-col items-center justify-center gap-[3px] transition-colors ${
                  active ? "text-ink" : "text-muted"
                }`}
              >
                {tab.icon?.(active)}
                <span className="text-[12px] font-semibold leading-[1.4]">{tab.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
