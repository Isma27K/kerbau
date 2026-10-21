import { describe, expect, test } from "vite-plus/test";
import { closeTab, keepTab, openTab, type RequestTab } from "./requestTabs";

const kept = (requestId: string): RequestTab => ({
  requestId,
  preview: false,
  openedUpdatedAt: null,
});
const preview = (requestId: string): RequestTab => ({
  requestId,
  preview: true,
  openedUpdatedAt: null,
});
const ids = (tabs: RequestTab[]) => tabs.map((t) => (t.preview ? `(${t.requestId})` : t.requestId));

describe("openTab", () => {
  test("replaces the existing preview tab in place", () => {
    const tabs = [kept("a"), preview("b"), kept("c")];
    expect(ids(openTab(tabs, "c", "d", { preview: true, updatedAt: null }))).toEqual([
      "a",
      "(d)",
      "c",
    ]);
  });

  test("inserts to the right of the anchor when there is no preview tab", () => {
    const tabs = [kept("a"), kept("b")];
    expect(ids(openTab(tabs, "a", "c", { preview: true, updatedAt: null }))).toEqual([
      "a",
      "(c)",
      "b",
    ]);
    expect(ids(openTab(tabs, null, "c", { preview: false, updatedAt: null }))).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  test("leaves an already open tab where it is, keeping it when asked", () => {
    const tabs = [kept("a"), preview("b")];
    expect(openTab(tabs, "a", "b", { preview: true, updatedAt: null })).toBe(tabs);
    expect(ids(openTab(tabs, "a", "b", { preview: false, updatedAt: null }))).toEqual(["a", "b"]);
  });
});

describe("keepTab", () => {
  test("turns a preview into a kept tab", () => {
    expect(ids(keepTab([preview("a")], "a"))).toEqual(["a"]);
  });
});

describe("closeTab", () => {
  const tabs = [kept("a"), kept("b"), kept("c")];

  test("activates the right neighbour, then the left, then nothing", () => {
    expect(closeTab(tabs, "b", "b").nextActiveId).toBe("c");
    expect(closeTab(tabs, "c", "c").nextActiveId).toBe("b");
    expect(closeTab([kept("a")], "a", "a").nextActiveId).toBeNull();
  });

  test("keeps the active tab when closing another", () => {
    const result = closeTab(tabs, "a", "c");
    expect(ids(result.tabs)).toEqual(["a", "b"]);
    expect(result.nextActiveId).toBeUndefined();
  });
});
