import type { AcmeBridge } from "../electron/preload.js";

declare global {
  interface Window {
    acme: AcmeBridge;
  }
}
export {};
