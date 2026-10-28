import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// 잠금 해제 시 LockGate가 AppNav(하위에 MainTabBar/NestedTabBar)를 렌더링하므로
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
import { saveSession, AUTO_LOCK_MS } from "@/lib/db/session-vault";
import { installFakeWebAuthn, uninstallFakeWebAuthn } from "@/test/biometric/fake-webauthn";
import { startEnrollment, clearBiometricOffered } from "@/lib/biometric/biometric-unlock";
import { getBiometricConfig } from "@/lib/db/local-store";

afterEach(async () => {
  // DB 초기화
  await db.delete();
  await db.open();
  // 스토어 초기화
  useAppStore.setState({ locked: true, sessionKey: null, lastRefreshAt: null });
  useNavStore.setState({ lastMainTabPath: "/" });
  uninstallFakeWebAuthn();
  localStorage.clear();
  // 제안 기록은 메모리에도 남으므로 함께 지운다
  clearBiometricOffered();
  // visibilityState를 덮어쓴 테스트가 있으면 jsdom 기본값으로 되돌린다
  Reflect.deleteProperty(document, "visibilityState");
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

/** PIN 잠금 설정을 심고 파생 키를 돌려준다. */
async function seedPin(pin: string) {
  const salt = makeSalt();
  const key = await deriveKey(pin, salt);
  await putSettings({ id: "app", kdfSalt: salt, verifier: await makeVerifier(key), schemaVersion: 1, lockType: "pin" });
  return key;
}

describe("LockGate — Face ID", { timeout: 20000 }, () => {
  it("등록돼 있으면 'Face ID로 열기' 버튼으로 잠금이 풀린다", async () => {
    const fake = installFakeWebAuthn();
    await seedPin("135790");
    await startEnrollment("135790");
    // 자동 시도는 거부되게 한다(iOS 제스처 제한 재현). 이후 버튼 탭은 성공한다.
    fake.get.mockRejectedValueOnce(new DOMException("x", "NotAllowedError"));
    const user = userEvent.setup();
    render(<LockGate><div>앱 콘텐츠</div></LockGate>);
    await waitFor(() => expect(fake.get).toHaveBeenCalledTimes(1));
    const btn = await screen.findByRole("button", { name: "Face ID로 열기" });
    await waitFor(() => expect(btn).not.toBeDisabled());
    await user.click(btn);
    await waitFor(() => expect(screen.getByText("앱 콘텐츠")).toBeInTheDocument(), { timeout: 15000 });
    expect(fake.get).toHaveBeenCalledTimes(2);
  });

  it("마운트 시 자동으로 한 번 시도한다", async () => {
    const fake = installFakeWebAuthn();
    await seedPin("135790");
    await startEnrollment("135790");
    render(<LockGate><div>앱 콘텐츠</div></LockGate>);
    await waitFor(() => expect(screen.getByText("앱 콘텐츠")).toBeInTheDocument(), { timeout: 15000 });
    expect(fake.get).toHaveBeenCalledTimes(1);
  });

  it("자동 시도가 거부되면 조용히 넘버패드와 버튼이 남는다", async () => {
    const fake = installFakeWebAuthn({ failGetWith: "NotAllowedError" });
    await seedPin("135790");
    await startEnrollment("135790");
    render(<LockGate><div>앱 콘텐츠</div></LockGate>);
    await waitFor(() => expect(fake.get).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole("button", { name: "Face ID로 열기" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "1" })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("저장된 PIN이 맞지 않으면 등록을 지우고 안내한다", async () => {
    installFakeWebAuthn();
    await seedPin("135790");
    await startEnrollment("000000"); // 다른 PIN으로 등록된 상태
    render(<LockGate><div>앱 콘텐츠</div></LockGate>);
    expect(await screen.findByText(/Face ID를 다시 켜 주세요/, undefined, { timeout: 15000 })).toBeInTheDocument();
    expect(await getBiometricConfig()).toBeUndefined();
    expect(screen.queryByRole("button", { name: "Face ID로 열기" })).not.toBeInTheDocument();
  });

  it("PIN으로 열면 등록 제안이 나오고, '괜찮아요'를 누르면 잠금이 풀리고 다시 묻지 않는다", async () => {
    installFakeWebAuthn();
    await seedPin("135790");
    const user = userEvent.setup();
    render(<LockGate><div>앱 콘텐츠</div></LockGate>);
    await screen.findByRole("button", { name: "1" });
    await tapPin(user, "135790");
    await user.click(await screen.findByRole("button", { name: "괜찮아요" }, { timeout: 15000 }));
    await waitFor(() => expect(screen.getByText("앱 콘텐츠")).toBeInTheDocument());
    expect(localStorage.getItem("dotori.biometricOffered")).toBe("1");
    expect(await getBiometricConfig()).toBeUndefined();
  });

  it("등록 제안에서 'Face ID 켜기'를 누르면 등록 후 잠금이 풀린다", async () => {
    installFakeWebAuthn();
    await seedPin("135790");
    const user = userEvent.setup();
    render(<LockGate><div>앱 콘텐츠</div></LockGate>);
    await screen.findByRole("button", { name: "1" });
    await tapPin(user, "135790");
    await user.click(await screen.findByRole("button", { name: "Face ID 켜기" }, { timeout: 15000 }));
    await waitFor(() => expect(screen.getByText("앱 콘텐츠")).toBeInTheDocument());
    expect(await getBiometricConfig()).toBeDefined();
    expect(localStorage.getItem("dotori.biometricOffered")).toBe("1");
  });

  it("이미 제안했으면 PIN으로 열 때 다시 묻지 않는다", async () => {
    installFakeWebAuthn();
    await seedPin("135790");
    localStorage.setItem("dotori.biometricOffered", "1");
    const user = userEvent.setup();
    render(<LockGate><div>앱 콘텐츠</div></LockGate>);
    await screen.findByRole("button", { name: "1" });
    await tapPin(user, "135790");
    await waitFor(() => expect(screen.getByText("앱 콘텐츠")).toBeInTheDocument(), { timeout: 15000 });
  });

  it("지원하지 않는 기기에서는 버튼도 제안도 없다", async () => {
    installFakeWebAuthn({ available: false });
    await seedPin("135790");
    const user = userEvent.setup();
    render(<LockGate><div>앱 콘텐츠</div></LockGate>);
    await screen.findByRole("button", { name: "1" });
    expect(screen.queryByRole("button", { name: "Face ID로 열기" })).not.toBeInTheDocument();
    await tapPin(user, "135790");
    await waitFor(() => expect(screen.getByText("앱 콘텐츠")).toBeInTheDocument(), { timeout: 15000 });
  });

  it("세션 복원 후 잠기면 로딩에 머물지 않고 PIN 화면이 나온다", async () => {
    const key = await seedPin("135790");
    // 마운트 시 세션 볼트로 자동 해제되는 상황(mode가 loading에 머문다)을 재현한다
    await saveSession(key, Date.now() + AUTO_LOCK_MS);
    render(<LockGate><div>앱 콘텐츠</div></LockGate>);
    await screen.findByText("앱 콘텐츠");
    act(() => useAppStore.getState().lock());
    expect(await screen.findByRole("button", { name: "1" })).toBeInTheDocument();
  });

  it("세션 복원 후 잠기면 Face ID를 자동으로 다시 시도한다", async () => {
    const fake = installFakeWebAuthn({ failGetWith: "NotAllowedError" });
    const key = await seedPin("135790");
    await startEnrollment("135790");
    await saveSession(key, Date.now() + AUTO_LOCK_MS);
    render(<LockGate><div>앱 콘텐츠</div></LockGate>);
    await screen.findByText("앱 콘텐츠");
    expect(fake.get).not.toHaveBeenCalled();
    act(() => useAppStore.getState().lock());
    await waitFor(() => expect(fake.get).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole("button", { name: "Face ID로 열기" })).toBeInTheDocument();
  });

  it("등록 후 PRF 값이 달라 복호화에 실패하면 등록을 지우고 다시 켜 달라고 안내한다", async () => {
    installFakeWebAuthn();
    await seedPin("135790");
    await startEnrollment("135790");
    uninstallFakeWebAuthn();
    installFakeWebAuthn({ prfSecret: new Uint8Array(32).fill(7) });
    render(<LockGate><div>앱 콘텐츠</div></LockGate>);
    expect(await screen.findByText("Face ID를 다시 켜 주세요. 지금은 PIN으로 열어 주세요.")).toBeInTheDocument();
    expect(await getBiometricConfig()).toBeUndefined();
  });

  it("그 밖의 오류면 일반 안내만 하고 등록은 지우지 않는다", async () => {
    const fake = installFakeWebAuthn();
    await seedPin("135790");
    await startEnrollment("135790");
    fake.get.mockRejectedValue(new DOMException("x", "AbortError"));
    render(<LockGate><div>앱 콘텐츠</div></LockGate>);
    expect(await screen.findByText("Face ID로 열지 못했어요. PIN을 입력해 주세요.")).toBeInTheDocument();
    expect(await getBiometricConfig()).toBeDefined();
    expect(screen.getByRole("button", { name: "Face ID로 열기" })).toBeInTheDocument();
  });

  it("버튼으로 연속 3번 취소하면 안내가 나온다", async () => {
    const fake = installFakeWebAuthn({ failGetWith: "NotAllowedError" });
    await seedPin("135790");
    await startEnrollment("135790");
    const user = userEvent.setup();
    render(<LockGate><div>앱 콘텐츠</div></LockGate>);
    await waitFor(() => expect(fake.get).toHaveBeenCalledTimes(1)); // 자동 시도(횟수에 넣지 않음)
    const btn = await screen.findByRole("button", { name: "Face ID로 열기" });
    for (let i = 2; i <= 4; i++) {
      await waitFor(() => expect(btn).not.toBeDisabled());
      if (i < 4) {
        expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      }
      await user.click(btn);
      await waitFor(() => expect(fake.get).toHaveBeenCalledTimes(i));
    }
    expect(await screen.findByRole("alert")).toHaveTextContent("Face ID로 열 수 없어요. PIN으로 연 뒤 설정에서 다시 켜 주세요.");
  });

  it("등록 시 PRF가 바로 오지 않으면 '한 번 더 확인해 주세요'로 마무리하고 잠금이 풀린다", async () => {
    installFakeWebAuthn({ prfOnCreate: "enabled-only" });
    await seedPin("135790");
    const user = userEvent.setup();
    render(<LockGate><div>앱 콘텐츠</div></LockGate>);
    await screen.findByRole("button", { name: "1" });
    await tapPin(user, "135790");
    await user.click(await screen.findByRole("button", { name: "Face ID 켜기" }, { timeout: 15000 }));
    await user.click(await screen.findByRole("button", { name: "한 번 더 확인해 주세요" }));
    await waitFor(() => expect(screen.getByText("앱 콘텐츠")).toBeInTheDocument());
    expect(await getBiometricConfig()).toBeDefined();
  });

  it("문자 비밀번호로 열어도 등록 제안이 나오고 '괜찮아요'로 열린다", async () => {
    installFakeWebAuthn();
    const salt = makeSalt();
    const key = await deriveKey("올바른비밀번호", salt);
    // lockType 없음 — 기존 문자 비밀번호 사용자
    await putSettings({ id: "app", kdfSalt: salt, verifier: await makeVerifier(key), schemaVersion: 1 });
    const user = userEvent.setup();
    render(<LockGate><div>앱 콘텐츠</div></LockGate>);
    await user.type(await screen.findByLabelText("비밀번호"), "올바른비밀번호");
    await user.click(screen.getByRole("button", { name: "잠금 해제하기" }));
    expect(await screen.findByRole("status", {}, { timeout: 15000 })).toHaveTextContent("다음부터 Face ID로 열까요?");
    expect(screen.getByText(/비밀번호 대신 얼굴로/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "괜찮아요" }));
    await waitFor(() => expect(screen.getByText("앱 콘텐츠")).toBeInTheDocument());
  });

  it("등록 제안 중 백그라운드로 가면 제안을 버리고 PIN 화면으로 돌아간다", async () => {
    installFakeWebAuthn();
    await seedPin("135790");
    const user = userEvent.setup();
    render(<LockGate><div>앱 콘텐츠</div></LockGate>);
    await screen.findByRole("button", { name: "1" });
    await tapPin(user, "135790");
    await screen.findByRole("button", { name: "괜찮아요" }, { timeout: 15000 });
    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(await screen.findByRole("button", { name: "1" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "괜찮아요" })).not.toBeInTheDocument();
    expect(useAppStore.getState().locked).toBe(true);
    expect(localStorage.getItem("dotori.biometricOffered")).toBeNull();
  });

  it("등록 확인 단계에서 '괜찮아요'를 누르면 만든 패스키를 정리한다", async () => {
    const fake = installFakeWebAuthn({ prfOnCreate: "enabled-only" });
    await seedPin("135790");
    const user = userEvent.setup();
    render(<LockGate><div>앱 콘텐츠</div></LockGate>);
    await screen.findByRole("button", { name: "1" });
    await tapPin(user, "135790");
    await user.click(await screen.findByRole("button", { name: "Face ID 켜기" }, { timeout: 15000 }));
    await screen.findByRole("button", { name: "한 번 더 확인해 주세요" });
    await user.click(screen.getByRole("button", { name: "괜찮아요" }));
    await waitFor(() => expect(screen.getByText("앱 콘텐츠")).toBeInTheDocument());
    expect(fake.PKC.signalUnknownCredential).toHaveBeenCalledWith({ rpId: location.hostname, credentialId: "AQIDBA" });
    expect(await getBiometricConfig()).toBeUndefined();
  });
});

/** get 호출을 붙잡아 두었다가 나중에 성공(resolve)·실패(reject)시킬 수 있게 한다. */
function deferGet(fake: ReturnType<typeof installFakeWebAuthn>) {
  let resolve: (v: unknown) => void = () => {};
  let reject: (e: unknown) => void = () => {};
  fake.get.mockImplementationOnce(
    () =>
      new Promise((res, rej) => {
        resolve = res as (v: unknown) => void;
        reject = rej;
      }),
  );
  // fake-webauthn의 기본 PRF 값(9로 채운 32바이트)과 같은 결과 — 등록한 PIN을 그대로 풀 수 있다.
  const okCred = {
    rawId: new Uint8Array([1, 2, 3, 4]).buffer,
    getClientExtensionResults: () => ({ prf: { results: { first: new Uint8Array(32).fill(9).buffer } } }),
  };
  return {
    succeed: () => resolve(okCred),
    cancel: () => reject(new DOMException("x", "NotAllowedError")),
  };
}

function setVisibility(state: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", { value: state, configurable: true });
  act(() => {
    document.dispatchEvent(new Event("visibilitychange"));
  });
}

describe("LockGate — Face ID 자동 시도 중 PIN 입력", { timeout: 20000 }, () => {
  it("자동 시도가 응답을 기다리는 동안에도 넘버패드로 열 수 있다", async () => {
    const fake = installFakeWebAuthn();
    await seedPin("135790");
    await startEnrollment("135790");
    fake.get.mockImplementationOnce(() => new Promise(() => {})); // 끝나지 않는 자동 시도
    const user = userEvent.setup();
    render(<LockGate><div>앱 콘텐츠</div></LockGate>);
    await waitFor(() => expect(fake.get).toHaveBeenCalledTimes(1));
    const one = await screen.findByRole("button", { name: "1" });
    expect(one).not.toBeDisabled();
    expect(screen.getByRole("button", { name: "Face ID로 열기" })).not.toBeDisabled();
    await tapPin(user, "135790");
    await waitFor(() => expect(screen.getByText("앱 콘텐츠")).toBeInTheDocument(), { timeout: 15000 });
  });

  it("PIN 입력을 시작한 뒤 늦게 온 Face ID 결과는 버린다", async () => {
    const fake = installFakeWebAuthn();
    await seedPin("135790");
    await startEnrollment("135790");
    const deferred = deferGet(fake);
    const user = userEvent.setup();
    render(<LockGate><div>앱 콘텐츠</div></LockGate>);
    await waitFor(() => expect(fake.get).toHaveBeenCalledTimes(1));
    await screen.findByRole("button", { name: "1" });
    await tapPin(user, "135");
    await act(async () => {
      deferred.succeed();
    });
    // 이전 코드라면 이 사이에 Face ID 결과로 잠금이 풀린다 — 충분히 기다린 뒤에도 잠겨 있어야 한다.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 1500));
    });
    expect(useAppStore.getState().locked).toBe(true);
    expect(screen.getByRole("status", { name: "6자리 중 3자리 입력" })).toBeInTheDocument();
    await tapPin(user, "790");
    await waitFor(() => expect(screen.getByText("앱 콘텐츠")).toBeInTheDocument(), { timeout: 15000 });
  });

  it("Face ID 요청 중의 hidden은 백그라운드로 보지 않아 취소 후 다시 시도하지 않는다", async () => {
    const fake = installFakeWebAuthn();
    await seedPin("135790");
    await startEnrollment("135790");
    const deferred = deferGet(fake);
    render(<LockGate><div>앱 콘텐츠</div></LockGate>);
    await waitFor(() => expect(fake.get).toHaveBeenCalledTimes(1));
    // Face ID 시트가 뜨며 hidden → 사용자가 취소 → visible
    setVisibility("hidden");
    await act(async () => {
      deferred.cancel();
    });
    setVisibility("visible");
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(fake.get).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Face ID로 열기" })).toBeInTheDocument();
  });

  it("요청이 없을 때 백그라운드에 다녀오면 다시 자동 시도한다", async () => {
    const fake = installFakeWebAuthn({ failGetWith: "NotAllowedError" });
    await seedPin("135790");
    await startEnrollment("135790");
    render(<LockGate><div>앱 콘텐츠</div></LockGate>);
    await waitFor(() => expect(fake.get).toHaveBeenCalledTimes(1));
    await screen.findByRole("button", { name: "Face ID로 열기" });
    setVisibility("hidden");
    setVisibility("visible");
    await waitFor(() => expect(fake.get).toHaveBeenCalledTimes(2));
  });
});
