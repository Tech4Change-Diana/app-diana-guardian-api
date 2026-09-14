/**
 * DIANA guardian-api — rotas de alertas (§7.1, §7.2).
 *   GET /alerts        -> lista de `AlertSummary` (resumo), ordenada desc.
 *   GET /alerts/:id     -> `AlertView` (detalhe resumido). 400/404.
 */
import type { FastifyInstance } from "fastify";
import { decodeAlertId } from "../../domain/alertId.js";
import { toAlertSummary, toAlertView } from "../../domain/summarize.js";
import type { AlertSummary } from "../../domain/viewTypes.js";
import type { AppDeps } from "../deps.js";
import { alertsQuerySchema } from "../validation.js";

/** Cursor de paginação simples: offset codificado em base64url. */
function encodeCursor(offset: number): string {
  return Buffer.from(String(offset), "utf-8").toString("base64url");
}

function decodeCursor(cursor: string | undefined): number {
  if (!cursor) return 0;
  const raw = Buffer.from(cursor, "base64url").toString("utf-8");
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

export function registerAlertRoutes(app: FastifyInstance, deps: AppDeps): void {
  const childName = (conversationId: string): string | undefined =>
    deps.reader.resolveChildName?.(conversationId);

  app.get("/alerts", async (request, reply) => {
    const parsed = alertsQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: "bad_request", issues: parsed.error.issues });
    }
    const { priority, category, limit, cursor } = parsed.data;

    const records = await deps.reader.listAlerts();
    let items: AlertSummary[] = records.map((record) =>
      toAlertSummary(record, { childName: childName(record.conversationId) }),
    );

    // Ordena por detectedAt desc (mais recente primeiro).
    items.sort((a, b) => b.detectedAt.localeCompare(a.detectedAt));

    if (priority) items = items.filter((item) => item.priority === priority);
    if (category) {
      const needle = category.toLowerCase();
      items = items.filter((item) => item.category.toLowerCase().includes(needle));
    }

    // Paginação simples (offset/cursor).
    const start = decodeCursor(cursor);
    const pageSize = limit ?? items.length;
    const page = items.slice(start, start + pageSize);
    const nextOffset = start + page.length;
    const nextCursor = nextOffset < items.length ? encodeCursor(nextOffset) : undefined;

    return reply.send({ items: page, ...(nextCursor ? { nextCursor } : {}) });
  });

  app.get<{ Params: { id: string } }>("/alerts/:id", async (request, reply) => {
    const ref = decodeAlertId(request.params.id);
    if (!ref) {
      return reply.code(400).send({ error: "bad_request", message: "alertId malformado." });
    }

    const record = await deps.reader.getAlert(ref.conversationId, ref.processedAt);
    if (!record) {
      return reply.code(404).send({ error: "not_found", message: "Alerta não encontrado." });
    }

    return reply.send(toAlertView(record, { childName: childName(record.conversationId) }));
  });
}
