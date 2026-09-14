import { describe, expect, it } from "vitest";
import type { AlertRecord } from "../src/contracts/index.js";
import { mapPriority, toAlertSummary, toAlertView } from "../src/domain/summarize.js";
import { demoAlertRecords } from "../src/sources/fixtures/demoAlerts.js";

const grooming = (): AlertRecord =>
  demoAlertRecords().find((r) => r.conversationId === "conv-demo-grooming")!;

describe("mapPriority", () => {
  it("mapeia low|medium|high para baixa|media|alta", () => {
    expect(mapPriority("low")).toBe("baixa");
    expect(mapPriority("medium")).toBe("media");
    expect(mapPriority("high")).toBe("alta");
  });
});

describe("toAlertSummary", () => {
  it("deriva o resumo com a categoria principal (maior probabilidade)", () => {
    const summary = toAlertSummary(grooming(), { childName: "Caio" });
    expect(summary.childName).toBe("Caio");
    expect(summary.priority).toBe("alta");
    expect(summary.score).toBe(73);
    expect(summary.category).toMatch(/grooming/i);
    expect(summary.detectedAt).toBe("2026-09-13T14:47:00.000Z");
  });

  it("usa fallback 'Criança' quando o nome não é fornecido", () => {
    expect(toAlertSummary(grooming()).childName).toBe("Criança");
  });
});

describe("toAlertView", () => {
  it("expõe assessment/sinais/explicação resumidos e occurrences", () => {
    const view = toAlertView(grooming(), { childName: "Caio" });
    expect(view.rationale).toBeTruthy();
    expect(view.categories.length).toBeGreaterThan(0);
    expect(view.signals[0]?.occurrences).toBe(view.signals[0]?.messageIds.length);
    expect(view.explanation.recommendedActions.length).toBeGreaterThan(0);
    expect(view.model.environment).toBe("mock");
  });
});

describe("RF-16 — nenhuma conversa/texto bruto vaza", () => {
  it("nenhuma serialização contém campos brutos proibidos", () => {
    for (const record of demoAlertRecords()) {
      const serialized =
        JSON.stringify(toAlertView(record)) + JSON.stringify(toAlertSummary(record));
      expect(serialized).not.toContain('"messages"');
      expect(serialized).not.toContain('"text"');
      expect(serialized).not.toContain('"conversation"');
      expect(serialized).not.toContain('"transcript"');
    }
  });

  it("a asserção defensiva rejeita conteúdo bruto que passe pela projeção", () => {
    const poisoned = grooming();
    // Simula deriva de contrato num campo repassado por spread (fator contextual
    // ganha um `text` com conteúdo bruto): a asserção defensiva deve barrar.
    (poisoned.result.explanation.contextualFactors[0] as unknown as { text: string }).text =
      "mensagem crua da criança";
    expect(() => toAlertView(poisoned)).toThrow(/RF-16/);
  });
});
