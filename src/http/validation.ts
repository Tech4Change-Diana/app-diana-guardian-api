/**
 * DIANA guardian-api — schemas de validação (zod) de entrada HTTP.
 */
import { z } from "zod";

/** Body de `POST /alerts/:id/feedback` (§7.3). */
export const feedbackBodySchema = z.object({
  verdict: z.enum(["useful", "false_positive", "not_sure"]),
  note: z.string().max(2000).optional(),
});

export type FeedbackBody = z.infer<typeof feedbackBodySchema>;

/** Body de `PUT /settings` (§7.4). */
const settingsItemSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  description: z.string(),
  enabled: z.boolean(),
});

const settingsSectionSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  items: z.array(settingsItemSchema),
});

export const settingsBodySchema = z.object({
  sections: z.array(settingsSectionSchema),
});

export type SettingsBody = z.infer<typeof settingsBodySchema>;

/** Query de `GET /alerts` (§7.1) — filtros opcionais. */
export const alertsQuerySchema = z.object({
  priority: z.enum(["alta", "media", "baixa"]).optional(),
  category: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  cursor: z.string().optional(),
});

export type AlertsQuery = z.infer<typeof alertsQuerySchema>;
