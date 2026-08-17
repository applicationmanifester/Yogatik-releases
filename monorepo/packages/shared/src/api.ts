import { API_BASE_URL } from "./constants.js";
import { noteSchema } from "./schemas.js";
import type { Note } from "./types.js";

/**
 * Minimal typed API client. Validates responses with the shared zod schemas so
 * both apps fail loudly on a bad payload instead of trusting `any`.
 */
export function createApiClient(baseUrl: string = API_BASE_URL) {
  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${baseUrl}${path}`, {
      headers: { "Content-Type": "application/json" },
      ...init,
    });
    if (!res.ok) throw new Error(`API ${res.status}: ${res.statusText}`);
    return (await res.json()) as T;
  }

  return {
    async listNotes(): Promise<Note[]> {
      const data = await request<unknown[]>("/notes");
      return data.map((d) => noteSchema.parse(d));
    },
    async createNote(input: { title: string; body: string }): Promise<Note> {
      const data = await request<unknown>("/notes", {
        method: "POST",
        body: JSON.stringify(input),
      });
      return noteSchema.parse(data);
    },
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
