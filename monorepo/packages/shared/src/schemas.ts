import { z } from "zod";

/** Runtime validation schemas (single source of truth for API payloads). */
export const userSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  email: z.string().email(),
});

export const noteSchema = z.object({
  id: z.string(),
  title: z.string().min(1),
  body: z.string(),
  createdAt: z.number(),
  updatedAt: z.number(),
});

export const createNoteSchema = noteSchema.pick({ title: true, body: true });

export type UserInput = z.infer<typeof userSchema>;
export type CreateNoteInput = z.infer<typeof createNoteSchema>;
