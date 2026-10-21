import { debounce } from "@yaakapp-internal/lib";
import { settingsAtom } from "@yaakapp-internal/models";
import { atom, useAtomValue } from "jotai";
import { useEffect } from "react";
import { jotaiStore } from "../lib/jotai";
import { getKeyValue, getKeyValueRaw, setKeyValue } from "../lib/keyValueStore";
import { closeTab, keepTab, openTab, type RequestTab } from "../lib/requestTabs";
import { setWorkspaceSearchParams } from "../lib/setWorkspaceSearchParams";
import { activeRequestAtom } from "./useActiveRequest";
import { activeRequestIdAtom } from "./useActiveRequestId";
import { activeWorkspaceIdAtom } from "./useActiveWorkspace";
import { allRequestsAtom } from "./useAllRequests";
import { useHotKey } from "./useHotKey";

const kvKey = (workspaceId: string) => `request_tabs::${workspaceId}`;
const namespace = "global";

interface StoredRequestTabs {
  tabs: RequestTab[];
  activeId: string | null;
}

/** Tabs as last written, which may still name requests that have since been deleted */
const tabsStateAtom = atom<{ workspaceId: string | null; tabs: RequestTab[] }>({
  workspaceId: null,
  tabs: [],
});

/** The open tabs for the active workspace, leaving out any whose request no longer exists */
export const requestTabsAtom = atom<RequestTab[]>((get) => {
  const { workspaceId, tabs } = get(tabsStateAtom);
  if (workspaceId == null || workspaceId !== get(activeWorkspaceIdAtom)) return [];
  const requests = get(allRequestsAtom);
  return tabs.filter((t) => requests.some((r) => r.id === t.requestId));
});

function updateTabs(fn: (tabs: RequestTab[]) => RequestTab[]) {
  const workspaceId = jotaiStore.get(activeWorkspaceIdAtom);
  if (workspaceId == null) return;
  jotaiStore.set(tabsStateAtom, { workspaceId, tabs: fn(jotaiStore.get(requestTabsAtom)) });
}

export function activateRequestTab(requestId: string) {
  setWorkspaceSearchParams({ request_id: requestId, folder_id: null });
}

export function keepRequestTab(requestId: string) {
  updateTabs((tabs) => keepTab(tabs, requestId));
}

export function closeRequestTab(requestId: string) {
  const activeId = jotaiStore.get(activeRequestIdAtom);
  const result = closeTab(jotaiStore.get(requestTabsAtom), activeId, requestId);
  updateTabs(() => result.tabs);
  if (result.nextActiveId !== undefined) {
    setWorkspaceSearchParams({ request_id: result.nextActiveId, folder_id: null });
  }
}

export function closeOtherRequestTabs(requestId: string) {
  updateTabs((tabs) => tabs.filter((t) => t.requestId === requestId));
  activateRequestTab(requestId);
}

export function closeAllRequestTabs() {
  updateTabs(() => []);
  setWorkspaceSearchParams({ request_id: null });
}

const saveTabs = debounce((workspaceId: string, value: StoredRequestTabs) => {
  setKeyValue({ namespace, key: kvKey(workspaceId), value }).catch(console.error);
}, 300);

export function useSubscribeRequestTabs() {
  const settings = useAtomValue(settingsAtom);
  const workspaceId = useAtomValue(activeWorkspaceIdAtom);
  const enabled = settings.requestTabsEnabled;
  const restore = enabled && settings.requestTabsRestore;

  // Start each workspace with fresh tabs, or with the saved ones when restoring is on
  useEffect(() => {
    if (!enabled || workspaceId == null) {
      jotaiStore.set(tabsStateAtom, { workspaceId: null, tabs: [] });
      return;
    }

    const stored = jotaiStore.get(settingsAtom).requestTabsRestore
      ? getKeyValue<StoredRequestTabs | null>({
          namespace,
          key: kvKey(workspaceId),
          fallback: null,
        })
      : null;
    const tabs = stored?.tabs ?? [];
    jotaiStore.set(tabsStateAtom, { workspaceId, tabs });

    const activeId = jotaiStore.get(activeRequestIdAtom);
    const activeIsOpen = tabs.some((t) => t.requestId === activeId);
    const storedActiveId = stored?.activeId ?? null;
    if (!activeIsOpen && tabs.some((t) => t.requestId === storedActiveId)) {
      if (storedActiveId != null) activateRequestTab(storedActiveId);
      return;
    }

    // Requests may still be loading. If so, the subscription below opens the tab once they arrive.
    const activeRequest = jotaiStore.get(activeRequestAtom);
    if (activeRequest != null && !activeIsOpen) {
      updateTabs((t) =>
        openTab(t, null, activeRequest.id, { preview: true, updatedAt: activeRequest.updatedAt }),
      );
    }
  }, [enabled, workspaceId]);

  // Give whatever becomes active a tab, however it got there (sidebar, switcher, palette, create),
  // and keep a preview tab once its request is edited
  useEffect(() => {
    let previousActiveId = jotaiStore.get(activeRequestIdAtom);
    return jotaiStore.sub(activeRequestAtom, () => {
      const request = jotaiStore.get(activeRequestAtom);
      const anchorId = previousActiveId;
      previousActiveId = request?.id ?? null;
      if (request == null || !jotaiStore.get(settingsAtom).requestTabsEnabled) return;

      const existing = jotaiStore.get(requestTabsAtom).find((t) => t.requestId === request.id);
      if (existing == null) {
        updateTabs((tabs) =>
          openTab(tabs, anchorId, request.id, { preview: true, updatedAt: request.updatedAt }),
        );
      } else if (existing.preview && existing.openedUpdatedAt !== request.updatedAt) {
        keepRequestTab(request.id);
      }
    });
  }, []);

  // Save the session while restoring is on, and forget it when restoring is turned off
  useEffect(() => {
    if (workspaceId == null) return;
    if (!restore) {
      if (getKeyValueRaw({ namespace, key: kvKey(workspaceId) }) != null) {
        setKeyValue({ namespace, key: kvKey(workspaceId), value: null }).catch(console.error);
      }
      return;
    }

    const save = () => {
      const state = jotaiStore.get(tabsStateAtom);
      if (state.workspaceId !== workspaceId) return;
      saveTabs(workspaceId, { tabs: state.tabs, activeId: jotaiStore.get(activeRequestIdAtom) });
    };
    const unsubTabs = jotaiStore.sub(tabsStateAtom, save);
    const unsubActive = jotaiStore.sub(activeRequestIdAtom, save);
    // Save right away too, or turning restoring on and quitting without touching a tab saves nothing
    save();
    return () => {
      unsubTabs();
      unsubActive();
    };
  }, [restore, workspaceId]);

  useHotKey(
    "request_tab.close",
    () => {
      const activeId = jotaiStore.get(activeRequestIdAtom);
      if (activeId != null) closeRequestTab(activeId);
    },
    { enable: () => jotaiStore.get(settingsAtom).requestTabsEnabled },
  );
}
