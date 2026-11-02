/** UA에서 기본 기기 이름(예: "Mac Chrome")을 만든다. 출처 표시용이라 정확할 필요는 없다 — 사용자가 고칠 수 있다. */

// 순서가 중요하다: iPhone UA에는 "Mac OS X", Android UA에는 "Linux", Chrome·Edge UA에는 "Safari"가 들어 있다.
const OS_RULES: readonly [RegExp, string][] = [
  [/iPhone/, "iPhone"],
  [/iPad/, "iPad"],
  [/Android/, "Android"],
  [/Macintosh|Mac OS X/, "Mac"],
  [/Windows/, "Windows"],
  [/Linux/, "Linux"],
];

const BROWSER_RULES: readonly [RegExp, string][] = [
  [/Edg\//, "Edge"],
  [/SamsungBrowser\//, "삼성 인터넷"],
  [/CriOS\/|Chrome\//, "Chrome"],
  [/FxiOS\/|Firefox\//, "Firefox"],
  [/Safari\//, "Safari"],
];

export function defaultDeviceName(userAgent: string): string {
  const os = OS_RULES.find(([re]) => re.test(userAgent))?.[1] ?? "기기";
  const browser = BROWSER_RULES.find(([re]) => re.test(userAgent))?.[1] ?? "브라우저";
  return `${os} ${browser}`;
}
