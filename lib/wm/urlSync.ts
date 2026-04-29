"use client";

import { useWindowStore } from "./store";
import { APPS } from "./registry";
import type { AppId } from "./types";

const VALID_IDS = new Set<AppId>(Object.keys(APPS) as AppId[]);

/**
 * Parses ?open=excel,about&sheet=metrics from the URL and opens those apps.
 * Returns true if any apps were hydrated.
 */
export function hydrateFromUrl(): boolean {
  if (typeof window === "undefined") return false;
  const params = new URLSearchParams(window.location.search);
  const open = params.get("open");
  if (!open) return false;

  const ids = open
    .split(",")
    .map((s) => s.trim() as AppId)
    .filter((id) => VALID_IDS.has(id));

  if (ids.length === 0) return false;

  const sheet = params.get("sheet");
  const store = useWindowStore.getState();
  for (const id of ids) {
    const def = APPS[id];
    store.openWindow({
      appId: id,
      title: def.title,
      iconUrl: def.iconUrl,
      size: def.defaultSize,
      minSize: def.minSize,
      singleton: def.singleton,
      noResize: def.noResize,
      hideFromTaskbar: def.hideFromTaskbar,
      props: id === "excel" && sheet ? { sheet } : undefined,
    });
  }
  return true;
}

/**
 * Writes current open window list back into ?open= for shareable links.
 * Called on every store mutation; debounced lightly via rAF.
 */
let scheduled = false;
export function syncUrl(): void {
  if (typeof window === "undefined") return;
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    const store = useWindowStore.getState();
    const order = store.order
      .map((id) => store.windows[id])
      .filter((w) => w && !w.hideFromTaskbar && w.appId !== "welcome" && w.appId !== "shutdown")
      .map((w) => w.appId);

    const unique = Array.from(new Set(order));
    const params = new URLSearchParams(window.location.search);
    if (unique.length > 0) {
      params.set("open", unique.join(","));
    } else {
      params.delete("open");
      params.delete("sheet");
    }
    const qs = params.toString();
    const newUrl = `${window.location.pathname}${qs ? `?${qs}` : ""}`;
    window.history.replaceState(null, "", newUrl);
  });
}
