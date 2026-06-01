import { spawn } from "bun";

console.log("Running tests with coverage...");
const proc = spawn(["bun", "test", "--coverage"], {
  stdout: "pipe",
  stderr: "pipe",
});

const stdoutText = await new Response(proc.stdout).text();
const stderrText = await new Response(proc.stderr).text();
const output = stdoutText + "\n" + stderrText;

// Print the original test output to stdout
console.log(output);

await proc.exited;
if (proc.exitCode !== 0) {
  console.error(`Tests failed with exit code ${proc.exitCode}`);
  process.exit(proc.exitCode);
}

const lines = output.split("\n");
let found = false;

for (const line of lines) {
  if (line.includes("All files")) {
    const parts = line.split("|").map(p => p.trim());
    if (parts.length >= 3) {
      const funcs = parseFloat(parts[1]);
      const linesPct = parseFloat(parts[2]);
      
      console.log("\n=================================");
      console.log("     OVERALL TEST COVERAGE       ");
      console.log("=================================");
      console.log(`Functions Coverage:  ${funcs.toFixed(2)}%`);
      console.log(`Lines Coverage:      ${linesPct.toFixed(2)}%`);
      console.log("=================================\n");
      
      found = true;
      
      // Optional threshold check
      const thresholdIndex = Bun.argv.indexOf("--threshold");
      if (thresholdIndex !== -1 && Bun.argv[thresholdIndex + 1]) {
        const threshold = parseFloat(Bun.argv[thresholdIndex + 1]);
        if (linesPct < threshold) {
          console.error(`Error: Line coverage (${linesPct.toFixed(2)}%) is below the configured threshold (${threshold}%).`);
          process.exit(1);
        } else {
          console.log(`Success: Line coverage is above the threshold of ${threshold}%.`);
        }
      }
      break;
    }
  }
}

if (!found) {
  console.error("Error: Could not find coverage summary in bun test output.");
  process.exit(1);
}
