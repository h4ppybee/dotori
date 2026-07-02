import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// 잠금 해제 시 LockGate가 AppNav(하위에 MainTabBar/AssetSubTabBar)를 렌더링하므로
// usePathname과 useRouter를 모킹한다.
vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ push: () => {} }),
}));

import { LockGate } from "@/components/LockGate";
import { db } from "@/lib/db/schema";
import { getSettings, putSettings, listMembers } from "@/lib/db/local-store";
import { makeSalt, deriveKey, makeVerifier } from "@/lib/crypto/crypto";
import { useAppStore } from "@/stores/app-store";
import { useNavStore } from "@/stores/nav-store";

afterEach(async () => {
  // DB 초기화
  await db.delete();
  await db.open();
  // 스토어 초기화
  useAppStore.setState({ locked: true, sessionKey: null, lastRefreshAt: null });
  useNavStore.setState({ lastMainTabPath: "/" });
});

// 테스트 전체에서 실제 Web Crypto를 사용한다 (no mocks).

/** 넘버패드로 PIN을 한 자리씩 입력한다. */
async function tapPin(user: ReturnType<typeof userEvent.setup>, pin: string) {
  for (const digit of pin) {
    await user.click(screen.getByRole("button", { name: digit }));
  }
}

describe("LockGate — 최초 실행 (설정 없음)", () => {
  it("설정이 없으면 PIN 설정 화면(넘버패드)이 나타난다", async () => {
    render(<LockGate><div>앱 콘텐츠</div></LockGate>);

    // 로딩 후 setup 화면이 나타날 때까지 대기
    await waitFor(() => {
      expect(screen.getByText("dotori에 오신 걸 환영해요")).toBeInTheDocument();
    });

    expect(screen.getByRole("button", { name: "1" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "지우기" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.queryByText("앱 콘텐츠")).not.toBeInTheDocument();
  });

  it("PIN을 두 번 일치 입력하면 설정·기본 구성원이 저장되고 잠금이 해제된다", async () => {
    const user = userEvent.setup();

    render(<LockGate><div>앱 콘텐츠</div></LockGate>);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "1" })).toBeInTheDocument();
    });

    await tapPin(user, "135790");

    // 확인 단계로 자동 전환
    await waitFor(() => {
      expect(screen.getByText("한 번 더 입력해요")).toBeInTheDocument();
    });

    await tapPin(user, "135790");

    // 잠금 해제 후 children가 보여야 한다
    await waitFor(() => {
      expect(screen.getByText("앱 콘텐츠")).toBeInTheDocument();
    }, { timeout: 15000 });

    // 설정이 DB에 저장되어야 한다
    const settings = await getSettings();
    expect(settings).not.toBeUndefined();
    expect(settings?.kdfSalt).toBeTruthy();
    expect(settings?.verifier).toBeTruthy();
    expect(settings?.schemaVersion).toBe(1);
    expect(settings?.lockType).toBe("pin");

    // 기본 구성원 "나"가 생성되어야 한다
    const members = await listMembers();
    expect(members).toHaveLength(1);
    expect(members[0].name).toBe("나");

    // 스토어가 잠금 해제 상태여야 한다
    expect(useAppStore.getState().locked).toBe(false);
    expect(useAppStore.getState().sessionKey).not.toBeNull();
  });

  it("확인 PIN이 다르면 에러를 보여주고 처음부터 다시 입력한다", async () => {
    const user = userEvent.setup();

    render(<LockGate><div>앱 콘텐츠</div></LockGate>);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "1" })).toBeInTheDocument();
    });

    await tapPin(user, "135790");
    await waitFor(() => {
      expect(screen.getByText("한 번 더 입력해요")).toBeInTheDocument();
    });
    await tapPin(user, "111111");

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });

    expect(screen.getByRole("alert").textContent).toContain("일치하지 않아요");
    // 처음 단계로 되돌아가고 점이 모두 비워져야 한다
    expect(screen.queryByText("한 번 더 입력해요")).not.toBeInTheDocument();
    expect(
      screen.getByRole("status", { name: "6자리 중 0자리 입력" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("앱 콘텐츠")).not.toBeInTheDocument();
    expect(useAppStore.getState().locked).toBe(true);
  });
});

describe("LockGate — 재진입 (PIN 잠금)", () => {
  const PIN = "135790";

  async function seedPinSettings() {
    const salt = makeSalt();
    const key = await deriveKey(PIN, salt);
    const verifier = await makeVerifier(key);
    await putSettings({
      id: "app",
      kdfSalt: salt,
      verifier,
      schemaVersion: 1,
      lockType: "pin",
    });
    return { salt, key };
  }

  it("lockType이 pin이면 넘버패드 잠금 해제 화면이 나타난다", async () => {
    await seedPinSettings();

    render(<LockGate><div>앱 콘텐츠</div></LockGate>);

    await waitFor(() => {
      expect(screen.getByText("dotori")).toBeInTheDocument();
    });

    expect(screen.getByRole("button", { name: "1" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.queryByLabelText("비밀번호")).not.toBeInTheDocument();
    expect(screen.queryByText("앱 콘텐츠")).not.toBeInTheDocument();
  });

  it("올바른 PIN을 입력하면 잠금이 해제된다", async () => {
    await seedPinSettings();
    const user = userEvent.setup();

    render(<LockGate><div>앱 콘텐츠</div></LockGate>);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "1" })).toBeInTheDocument();
    });

    await tapPin(user, PIN);

    await waitFor(() => {
      expect(screen.getByText("앱 콘텐츠")).toBeInTheDocument();
    }, { timeout: 15000 });

    expect(useAppStore.getState().locked).toBe(false);
    expect(useAppStore.getState().sessionKey).not.toBeNull();
  });

  it("틀린 PIN을 입력하면 에러가 나타나고 입력이 초기화된다", async () => {
    await seedPinSettings();
    const user = userEvent.setup();

    render(<LockGate><div>앱 콘텐츠</div></LockGate>);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "1" })).toBeInTheDocument();
    });

    await tapPin(user, "111111");

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    }, { timeout: 15000 });

    expect(screen.getByRole("alert").textContent).toContain("일치하지 않아요");
    expect(
      screen.getByRole("status", { name: "6자리 중 0자리 입력" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("앱 콘텐츠")).not.toBeInTheDocument();
    expect(useAppStore.getState().locked).toBe(true);
    expect(useAppStore.getState().sessionKey).toBeNull();
  });
});

describe("LockGate — 재진입 (기존 문자 비밀번호)", () => {
  const PASSPHRASE = "올바른비밀번호";

  async function seedSettings() {
    const salt = makeSalt();
    const key = await deriveKey(PASSPHRASE, salt);
    const verifier = await makeVerifier(key);
    // lockType 없음 — 기존 사용자 데이터
    await putSettings({ id: "app", kdfSalt: salt, verifier, schemaVersion: 1 });
    return { salt, key };
  }

  it("lockType이 없으면 기존 텍스트 입력 화면과 PIN 전환 안내가 나타난다", async () => {
    await seedSettings();

    render(<LockGate><div>앱 콘텐츠</div></LockGate>);

    await waitFor(() => {
      expect(screen.getByText("dotori")).toBeInTheDocument();
    });

    expect(screen.getByLabelText("비밀번호")).toBeInTheDocument();
    expect(screen.queryByLabelText("비밀번호 확인")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "잠금 해제하기" })).toBeInTheDocument();
    expect(screen.getByText("설정에서 PIN으로 바꿀 수 있어요.")).toBeInTheDocument();
    expect(screen.queryByText("앱 콘텐츠")).not.toBeInTheDocument();
  });

  it("올바른 비밀번호를 입력하면 잠금이 해제된다", async () => {
    await seedSettings();
    const user = userEvent.setup();

    render(<LockGate><div>앱 콘텐츠</div></LockGate>);

    await waitFor(() => {
      expect(screen.getByLabelText("비밀번호")).toBeInTheDocument();
    });

    await user.type(screen.getByLabelText("비밀번호"), PASSPHRASE);
    await user.click(screen.getByRole("button", { name: "잠금 해제하기" }));

    await waitFor(() => {
      expect(screen.getByText("앱 콘텐츠")).toBeInTheDocument();
    }, { timeout: 15000 });

    expect(useAppStore.getState().locked).toBe(false);
    expect(useAppStore.getState().sessionKey).not.toBeNull();
  });

  it("틀린 비밀번호를 입력하면 에러 메시지가 나타나고 잠금 상태가 유지된다", async () => {
    await seedSettings();
    const user = userEvent.setup();

    render(<LockGate><div>앱 콘텐츠</div></LockGate>);

    await waitFor(() => {
      expect(screen.getByLabelText("비밀번호")).toBeInTheDocument();
    });

    await user.type(screen.getByLabelText("비밀번호"), "틀린비밀번호");
    await user.click(screen.getByRole("button", { name: "잠금 해제하기" }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    }, { timeout: 15000 });

    expect(screen.getByRole("alert").textContent).toContain("일치하지 않아요");
    expect(screen.queryByText("앱 콘텐츠")).not.toBeInTheDocument();
    expect(useAppStore.getState().locked).toBe(true);
    expect(useAppStore.getState().sessionKey).toBeNull();
  });

  it("기존 구성원이 있을 때 재진입 후 기본 구성원을 추가하지 않는다", async () => {
    // 이미 구성원이 있는 상태로 설정
    await db.members.put({ id: "existing-member", name: "기존 구성원" });
    await seedSettings();
    const user = userEvent.setup();

    render(<LockGate><div>앱 콘텐츠</div></LockGate>);

    await waitFor(() => {
      expect(screen.getByLabelText("비밀번호")).toBeInTheDocument();
    });

    await user.type(screen.getByLabelText("비밀번호"), PASSPHRASE);
    await user.click(screen.getByRole("button", { name: "잠금 해제하기" }));

    await waitFor(() => {
      expect(screen.getByText("앱 콘텐츠")).toBeInTheDocument();
    }, { timeout: 15000 });

    // 잠금 해제 흐름에서는 구성원을 건드리지 않아야 한다
    const members = await listMembers();
    expect(members).toHaveLength(1);
    expect(members[0].name).toBe("기존 구성원");
  });
});
