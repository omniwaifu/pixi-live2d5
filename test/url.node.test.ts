import { describe, expect, it } from "vitest";
import { normalizePath, resolveUrl } from "../src/utils/url";

describe("resolveUrl", () => {
    it.each([
        // absolute resource URLs win over any base
        ["/models/m.json", "https://cdn.test/t.png", "https://cdn.test/t.png"],
        ["models/m.json", "https://cdn.test/t.png?v=1#frag", "https://cdn.test/t.png?v=1#frag"],
        ["https://a.test/models/m.json", "https://cdn.test/t.png", "https://cdn.test/t.png"],
        ["models/m.json", "blob:https://app.test/0b8e", "blob:https://app.test/0b8e"],
        ["/models/m.json", "data:image/png;base64,AAAA", "data:image/png;base64,AAAA"],
        // absolute bases
        ["https://a.test/models/m.json", "t.png", "https://a.test/models/t.png"],
        ["https://a.test/models/m.json", "../t.png?x=1#y", "https://a.test/t.png?x=1#y"],
        // scheme-relative resources and bases
        ["models/m.json", "//cdn.test/t.png", "//cdn.test/t.png"],
        ["/models/m.json", "//cdn.test/a/t.png?q=1#h", "//cdn.test/a/t.png?q=1#h"],
        ["//cdn.test/models/m.json", "t.png", "//cdn.test/models/t.png"],
        ["//cdn.test/models/m.json", "/t.png", "//cdn.test/t.png"],
        // rooted resources with relative or rooted bases
        ["models/m.json", "/t.png", "/t.png"],
        ["/models/m.json", "/t.png", "/t.png"],
        // existing relative behavior, including query/hash and traversal
        ["/models/m.json", "t.png", "/models/t.png"],
        ["models/m.json", "t.png?v=2#x", "models/t.png?v=2#x"],
        ["Mao/Mao.model3.json", "../x.png", "x.png"],
        ["Mao/Mao.model3.json", "textures/a b.png", "Mao/textures/a%20b.png"],
    ])("resolveUrl(%j, %j) → %j", (base, path, expected) => {
        expect(resolveUrl(base, path)).toBe(expected);
    });

    it("keeps URL constructor errors for malformed absolute URLs", () => {
        expect(() => resolveUrl("models/m.json", "http://[bad/t.png")).toThrow(TypeError);
    });
});

describe("normalizePath", () => {
    it("normalizes raw file paths the same way resolved settings paths are", () => {
        const settingsURL = "model dir/m.model3.json";

        for (const name of ["tex[1].png", "100%.png", "a b.png"]) {
            expect(normalizePath(`model dir/${name}`)).toBe(resolveUrl(settingsURL, name));
        }
    });
});
