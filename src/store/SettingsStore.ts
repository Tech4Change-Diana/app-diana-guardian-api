/**
 * DIANA guardian-api — persistência de SETTINGS do responsável (§7.4).
 *
 * Backends: `memory` (default p/ demo) e `file` (grava em
 * `STATE_DIR/settings/guardian.json`). Documento único global no MVP.
 * `get` retorna o default quando ausente.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import type { GuardianSettings } from "../domain/viewTypes.js";
import { defaultGuardianSettings } from "./defaultSettings.js";

export interface SettingsStore {
  get(): Promise<GuardianSettings>;
  put(settings: GuardianSettings): Promise<GuardianSettings>;
}

export class MemorySettingsStore implements SettingsStore {
  private current: GuardianSettings | null = null;

  async get(): Promise<GuardianSettings> {
    return this.current ? structuredClone(this.current) : defaultGuardianSettings();
  }

  async put(settings: GuardianSettings): Promise<GuardianSettings> {
    this.current = structuredClone(settings);
    return structuredClone(this.current);
  }
}

export class FileSettingsStore implements SettingsStore {
  private readonly filePath: string;

  constructor(stateDir: string) {
    this.filePath = path.join(stateDir, "settings", "guardian.json");
  }

  async get(): Promise<GuardianSettings> {
    try {
      const raw = await fs.readFile(this.filePath, "utf-8");
      return JSON.parse(raw) as GuardianSettings;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return defaultGuardianSettings();
      throw err;
    }
  }

  async put(settings: GuardianSettings): Promise<GuardianSettings> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    await fs.writeFile(this.filePath, `${JSON.stringify(settings, null, 2)}\n`, "utf-8");
    return structuredClone(settings);
  }
}
