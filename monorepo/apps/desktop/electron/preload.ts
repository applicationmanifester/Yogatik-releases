import { contextBridge, ipcRenderer } from "electron";

/**
 * The ONLY bridge between renderer and main. Everything is an explicit, typed
 * function — no raw ipcRenderer, no Node globals leak into the page.
 */
const api = {
  getVersion: (): Promise<string> => ipcRenderer.invoke("app:getVersion"),
  openExternal: (url: string): Promise<void> => ipcRenderer.invoke("dialog:openExternal", url),
  onMenu: (cb: (action: string) => void) => {
    const listener = (_e: unknown, action: string) => cb(action);
    ipcRenderer.on("menu", listener);
    return () => ipcRenderer.removeListener("menu", listener);
  },
  onDeepLink: (cb: (url: string) => void) => {
    const listener = (_e: unknown, url: string) => cb(url);
    ipcRenderer.on("deep-link", listener);
    return () => ipcRenderer.removeListener("deep-link", listener);
  },
};

contextBridge.exposeInMainWorld("acme", api);

export type AcmeBridge = typeof api;
