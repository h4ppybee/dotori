"use client";

/** 아직 구현되지 않은 화면용 더미. 제목만 중앙에 표시한다. */
export function DummyPage({ title }: { title: string }) {
  return (
    <main className="flex min-h-[60vh] flex-col items-center justify-center px-5">
      <h1 className="text-[22px] font-bold tracking-[-0.3px] text-ink">{title}</h1>
      <p className="mt-2 text-[15px] text-muted">곧 준비될 화면이에요</p>
    </main>
  );
}
