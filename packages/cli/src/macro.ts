import { readFileSync } from "node:fs";
import { join } from "node:path";

export function getSkillContent() {
  const path = join(import.meta.dir, "../skills/hornbill/SKILL.md");
  return readFileSync(path, "utf-8");
}
