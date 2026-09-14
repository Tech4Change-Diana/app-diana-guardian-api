/**
 * Contrato de domínio compartilhado da DIANA (cópia portada do núcleo).
 *
 * Ponto único de importação dos tipos canônicos (`Conversation`,
 * `AnalysisResult`, `AlertRecord`, ...). Enquanto `@diana/contracts` não
 * existe, o resto do serviço importa daqui:
 * `import type { AnalysisResult } from "../contracts/index.js";`.
 */
export * from "./types.js";
export * from "./alertRecord.js";
