import { readFileSync } from "node:fs";
import { join } from "node:path";
import packageJson from "../package.json";

export function getSkillContent() {
  const path = join(import.meta.dir, "../skills/hornbill/SKILL.md");
  const raw = readFileSync(path, "utf-8");
  return raw.replace(/generator: hornbill-cli v[^\n\r]+/, `generator: hornbill-cli v${packageJson.version}`);
}
