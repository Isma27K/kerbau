/**
 * Pure tab-list operations for request tabs. Kept free of atoms and navigation so the ordering
 * rules (where a tab lands, which tab a close activates) can be tested on their own.
 */

export interface RequestTab {
  requestId: string;
  /** A preview tab is replaced by the next request opened, until it is kept. */
  preview: boolean;
  /** The request's `updatedAt` when it was opened, so an edit can turn a preview into a kept tab */
  openedUpdatedAt: string | null;
}

export function openTab(
  tabs: RequestTab[],
  anchorId: string | null,
  requestId: string,
  { preview, updatedAt }: { preview: boolean; updatedAt: string | null },
): RequestTab[] {
  const existing = tabs.find((t) => t.requestId === requestId);
  if (existing != null) {
    return preview || !existing.preview ? tabs : keepTab(tabs, requestId);
  }

  const tab: RequestTab = { requestId, preview, openedUpdatedAt: updatedAt };

  if (preview) {
    const previewIndex = tabs.findIndex((t) => t.preview);
    if (previewIndex !== -1) {
      return tabs.map((t, i) => (i === previewIndex ? tab : t));
    }
  }

  const anchorIndex = tabs.findIndex((t) => t.requestId === anchorId);
  if (anchorIndex === -1) return [...tabs, tab];
  return [...tabs.slice(0, anchorIndex + 1), tab, ...tabs.slice(anchorIndex + 1)];
}

export function keepTab(tabs: RequestTab[], requestId: string): RequestTab[] {
  return tabs.map((t) => (t.requestId === requestId && t.preview ? { ...t, preview: false } : t));
}

/**
 * Close a tab. When it was the active one, `nextActiveId` is the tab to its right, else the one to
 * its left, else null. It is undefined when the active tab doesn't change.
 */
export function closeTab(
  tabs: RequestTab[],
  activeId: string | null,
  requestId: string,
): { tabs: RequestTab[]; nextActiveId: string | null | undefined } {
  const index = tabs.findIndex((t) => t.requestId === requestId);
  if (index === -1) return { tabs, nextActiveId: undefined };

  const next = tabs.filter((t) => t.requestId !== requestId);
  if (requestId !== activeId) return { tabs: next, nextActiveId: undefined };

  const neighbor = next[index] ?? next[index - 1] ?? null;
  return { tabs: next, nextActiveId: neighbor?.requestId ?? null };
}
