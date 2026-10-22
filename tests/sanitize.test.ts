import { describe, expect, it } from "vitest";
import { sanitizeFreeText, sanitizeModelText } from "@/security/sanitize";

describe("sanitizeFreeText", () => {
  it("replaces control characters and collapses whitespace", () => {
    expect(sanitizeFreeText("a\u0000b\u0007c\n\n d\t e", 100)).toBe("a b c d e");
  });
  it("removes zero-width and bidirectional override characters", () => {
    expect(sanitizeFreeText("pay\u200Bment \u202Egnp.exe\u202C", 100)).toBe("payment gnp.exe");
  });
  it("normalises compatibility characters", () => {
    expect(sanitizeFreeText("ＡＢＣ ﬁne", 100)).toBe("ABC fine");
  });
  it("truncates by code points so emoji are not split", () => {
    expect(sanitizeFreeText("😀".repeat(10), 3)).toBe("😀😀😀");
  });
  it("trims and keeps ordinary text intact", () => {
    expect(sanitizeFreeText("  Chai & samosas, please  ", 100)).toBe("Chai & samosas, please");
  });
});

describe("sanitizeModelText", () => {
  it("strips HTML tags but keeps ordinary comparisons", () => {
    expect(sanitizeModelText("Use <b>bold</b> <script>alert(1)</script> flowers", 200)).toBe("Use bold alert(1) flowers");
    expect(sanitizeModelText("Keep guests < 100 and budget > 5", 200)).toBe("Keep guests < 100 and budget > 5");
  });
  it("drops links from model output", () => {
    expect(sanitizeModelText("Try this https://evil.example/x now and www.bad.io too", 200)).toBe("Try this now and too");
  });
});
