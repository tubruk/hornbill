import readline from "node:readline";
import { Writable } from "node:stream";

export async function promptText(query: string, defaultValue = ""): Promise<string> {
  const displayQuery = defaultValue ? `${query} [${defaultValue}]: ` : `${query}: `;
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise<string>((resolve) => {
    rl.question(displayQuery, (answer) => {
      rl.close();
      resolve(answer.trim() || defaultValue);
    });
  });
}

export async function promptPassword(query: string): Promise<string> {
  let muted = false;
  const mutableStdout = new Writable({
    write: function(chunk, encoding, callback) {
      if (!muted) {
        process.stdout.write(chunk, encoding);
      }
      callback();
    }
  });

  const rl = readline.createInterface({
    input: process.stdin,
    output: mutableStdout,
    terminal: true,
  });

  return new Promise<string>((resolve) => {
    process.stdout.write(query);
    muted = true;
    rl.question("", (answer) => {
      rl.close();
      muted = false;
      process.stdout.write("\n");
      resolve(answer);
    });
  });
}

export async function promptSelect(
  query: string,
  options: { name: string; value: string; desc?: string }[]
): Promise<string> {
  console.log(`\n${query}`);
  options.forEach((opt, idx) => {
    const num = idx + 1;
    const descStr = opt.desc ? ` - ${opt.desc}` : "";
    console.log(`  [${num}] ${opt.name}${descStr}`);
  });

  while (true) {
    const answer = await promptText(`Select option (1-${options.length})`);
    const num = parseInt(answer, 10);
    if (!isNaN(num) && num >= 1 && num <= options.length) {
      return options[num - 1].value;
    }
    console.log("Invalid option, please choose a number from the list.");
  }
}

