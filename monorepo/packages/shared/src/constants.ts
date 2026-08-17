export const APP_NAME = "Acme";
export const API_BASE_URL: string =
  (import.meta as { env?: Record<string, string> }).env?.VITE_API_BASE_URL ??
  "https://api.example.com";
export const DEFAULT_PAGE_SIZE = 20;
