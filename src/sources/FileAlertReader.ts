/**
 * DIANA guardian-api — leitor de alertas em DISCO (dev / integração local).
 *
 * Varre `STATE_DIR/alerts/<conversationId>/<processedAt>.json` — exatamente o
 * layout que o `FileStateStore` do núcleo grava (§5.1). Usado com
 * `ALERTS_SOURCE=file` para integrar com o núcleo rodando na mesma máquina.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import type { AlertRecord } from "../contracts/index.js";
import type { AlertReader } from "./AlertReader.js";

/** Sanitiza um id igual ao `safeId` do núcleo (para localizar o arquivo). */
function safeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export class FileAlertReader implements AlertReader {
  private readonly alertsDir: string;

  constructor(stateDir: string) {
    this.alertsDir = path.join(stateDir, "alerts");
  }

  private async readJson(filePath: string): Promise<AlertRecord | null> {
    try {
      const raw = await fs.readFile(filePath, "utf-8");
      return JSON.parse(raw) as AlertRecord;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw err;
    }
  }

  async listAlerts(): Promise<AlertRecord[]> {
    let conversationDirs: string[];
    try {
      const entries = await fs.readdir(this.alertsDir, { withFileTypes: true });
      conversationDirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw err;
    }

    const records: AlertRecord[] = [];
    for (const dir of conversationDirs) {
      const dirPath = path.join(this.alertsDir, dir);
      const files = await fs.readdir(dirPath);
      for (const file of files) {
        if (!file.endsWith(".json")) continue;
        const record = await this.readJson(path.join(dirPath, file));
        if (record) records.push(record);
      }
    }
    return records;
  }

  async getAlert(conversationId: string, processedAt: string): Promise<AlertRecord | null> {
    const filePath = path.join(
      this.alertsDir,
      safeId(conversationId),
      `${safeId(processedAt)}.json`,
    );
    return this.readJson(filePath);
  }
}
