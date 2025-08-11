import readline from 'node:readline';
import { blueBright, reset } from 'ansis';
import { default as levenshtein } from 'fast-levenshtein';
const getConfirmation = async (suggestion: string): Promise<boolean> => {
  if (!process.stdin.isTTY) return false;
  const question = `${reset(`Did you mean ${blueBright(suggestion)}?`)} (Y/n) `;
  return await new Promise<boolean>((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    let answered = false;
    // Timeout after 10 seconds
    const timeout = global.setTimeout(() => {
      if (!answered) {
        rl.close();
        resolve(false);
      }
    }, 10_000);
    rl.question(question, (answer) => {
      answered = true;
      global.clearTimeout(timeout);
      rl.close();
      const a = (answer ?? '').trim().toLowerCase();
      resolve(a === '' || a === 'y' || a === 'yes');
    });
  });
};
const closest = (target: string, possibilities: string[]): string =>
  possibilities
    .map((id) => ({
      distance: levenshtein.get(target, id, { useCollator: true }),
      id,
    }))
    .sort((a, b) => a.distance - b.distance)[0]?.id ?? '';
export default {
  closest,
  getConfirmation,
};
