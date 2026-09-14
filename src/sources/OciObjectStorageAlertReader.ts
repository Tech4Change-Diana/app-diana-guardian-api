/**
 * DIANA guardian-api — leitor de alertas do OCI Object Storage (produção MVP).
 *
 * 🚧 PLACEHOLDER (PR-11). A dependência `oci-sdk` é isolada e ainda NÃO entra
 * no MVP inicial (a demo roda com `ALERTS_SOURCE=fixtures`). Este stub existe
 * para manter o `seam` da fonte de dados: quando o backend `oci` for
 * implementado, `listObjects(prefix="alerts/")` + `getObject` no bucket entram
 * aqui — ADIÇÃO, não reescrita (mesmos métodos da interface `AlertReader`).
 *
 * Selecionar `ALERTS_SOURCE=oci` sem essa implementação falha explicitamente na
 * inicialização, com instrução clara — nunca silenciosamente.
 */
import type { AlertRecord } from "../contracts/index.js";
import type { AlertReader } from "./AlertReader.js";

export interface OciObjectStorageConfig {
  bucket: string;
  namespace: string;
  region: string;
}

const NOT_IMPLEMENTED =
  "ALERTS_SOURCE=oci ainda não está implementado neste MVP (ver PR-11 da análise). " +
  "Use ALERTS_SOURCE=fixtures (demo) ou ALERTS_SOURCE=file (dev com o STATE_DIR do núcleo).";

export class OciObjectStorageAlertReader implements AlertReader {
  constructor(private readonly config: OciObjectStorageConfig) {}

  async listAlerts(): Promise<AlertRecord[]> {
    void this.config;
    throw new Error(NOT_IMPLEMENTED);
  }

  async getAlert(_conversationId: string, _processedAt: string): Promise<AlertRecord | null> {
    throw new Error(NOT_IMPLEMENTED);
  }
}
