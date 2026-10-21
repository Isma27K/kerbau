import type { AnyModel } from "@yaakapp-internal/models";
import classNames from "classnames";
import { useAtomValue } from "jotai";
import { useState } from "react";
import { activeRequestIdAtom } from "../hooks/useActiveRequestId";
import { allRequestsAtom } from "../hooks/useAllRequests";
import {
  activateRequestTab,
  closeAllRequestTabs,
  closeOtherRequestTabs,
  closeRequestTab,
  keepRequestTab,
  requestTabsAtom,
} from "../hooks/useRequestTabs";
import type { RequestTab as RequestTabModel } from "../lib/requestTabs";
import { resolvedModelName } from "../lib/resolvedModelName";
import { ContextMenu } from "./core/Dropdown";
import { HttpMethodTag } from "./core/HttpMethodTag";
import { IconButton } from "./core/IconButton";

export function RequestTabs() {
  const tabs = useAtomValue(requestTabsAtom);
  const requests = useAtomValue(allRequestsAtom);
  const activeRequestId = useAtomValue(activeRequestIdAtom);
  const [contextMenu, setContextMenu] = useState<{
    requestId: string;
    position: { x: number; y: number };
  } | null>(null);

  if (tabs.length === 0) return null;

  return (
    <div
      role="tablist"
      className={classNames(
        "flex items-stretch h-md overflow-x-auto hide-scrollbars",
        "bg-surface border-b border-border-subtle",
      )}
    >
      {tabs.map((tab) => {
        const request = requests.find((r) => r.id === tab.requestId);
        if (request == null) return null;
        return (
          <RequestTab
            key={tab.requestId}
            tab={tab}
            request={request}
            active={tab.requestId === activeRequestId}
            onContextMenu={(position) => setContextMenu({ requestId: tab.requestId, position })}
          />
        );
      })}
      {contextMenu != null && (
        <ContextMenu
          triggerPosition={contextMenu.position}
          onClose={() => setContextMenu(null)}
          items={[
            { label: "Close", onSelect: () => closeRequestTab(contextMenu.requestId) },
            { label: "Close Others", onSelect: () => closeOtherRequestTabs(contextMenu.requestId) },
            { label: "Close All", onSelect: closeAllRequestTabs },
          ]}
        />
      )}
    </div>
  );
}

function RequestTab({
  tab,
  request,
  active,
  onContextMenu,
}: {
  tab: RequestTabModel;
  request: AnyModel;
  active: boolean;
  onContextMenu: (position: { x: number; y: number }) => void;
}) {
  const name = resolvedModelName(request) || "Untitled";
  return (
    <div
      role="tab"
      aria-selected={active}
      title={name}
      onClick={() => activateRequestTab(tab.requestId)}
      onDoubleClick={() => keepRequestTab(tab.requestId)}
      onAuxClick={(e) => {
        if (e.button === 1) closeRequestTab(tab.requestId);
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        onContextMenu({ x: e.clientX, y: e.clientY });
      }}
      className={classNames(
        "group relative flex items-center gap-1.5 shrink-0 max-w-56 pl-3 pr-1 cursor-default",
        "border-r border-border-subtle text-sm select-none",
        active ? "bg-surface-active text-text" : "text-text-subtle hover:bg-surface-highlight",
      )}
    >
      {active && <div className="absolute left-0 right-0 bottom-0 h-0.5 bg-primary" />}
      {(request.model === "http_request" ||
        request.model === "grpc_request" ||
        request.model === "websocket_request") && (
        <HttpMethodTag short className="text-xs" request={request} />
      )}
      <span className={classNames("truncate", tab.preview && "italic")}>{name}</span>
      <IconButton
        size="2xs"
        iconSize="sm"
        icon="x"
        title="Close tab"
        className={classNames(!active && "opacity-0 group-hover:opacity-100")}
        onClick={(e) => {
          e.stopPropagation();
          closeRequestTab(tab.requestId);
        }}
      />
    </div>
  );
}
