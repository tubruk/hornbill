import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

export interface CLIConfig {
  url?: string;
  key?: string;
}

export function getConfigDir(): string {
  // Use XDG_CONFIG_HOME if defined, otherwise default to ~/.config/hornbill
  const baseDir = process.env.XDG_CONFIG_HOME || join(homedir(), ".config");
  return join(baseDir, "hornbill");
}

export function getConfigPath(): string {
  return join(getConfigDir(), "config.json");
}

export function loadConfig(): CLIConfig {
  const configPath = getConfigPath();
  if (!existsSync(configPath)) {
    return {};
  }
  try {
    const raw = readFileSync(configPath, "utf-8");
    return JSON.parse(raw) as CLIConfig;
  } catch {
    return {};
  }
}

export function saveConfig(config: CLIConfig): void {
  const configDir = getConfigDir();
  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true });
  }
  const configPath = getConfigPath();
  writeFileSync(configPath, JSON.stringify(config, null, 2), "utf-8");
}

export interface ResolvedConfig {
  url: string;
  key: string;
}

export function resolveConfig(options: { url?: string; key?: string }): ResolvedConfig {
  const fileConfig = loadConfig();

  const url = options.url || process.env.HORNBILL_API_URL || fileConfig.url || "http://localhost:3000";
  const key = options.key || process.env.HORNBILL_API_KEY || fileConfig.key || "";

  return { url, key };
}
