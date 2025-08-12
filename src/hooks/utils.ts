import readline from 'node:readline';
import { blueBright, reset } from 'ansis';
import levenshtein from 'fast-levenshtein';

const getConfirmation = async (suggestion: string): Promise<boolean> => {
  if (!process.stdin.isTTY) return false;

  const question = `${reset('Did you mean ' + blueBright(suggestion) + '?')} (Y/n) `;

  return new Promise<boolean>((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    let settled = false;

    const cleanup = () => {
      rl.close();
      clearTimeout(timeout);
    };

    const finish = (result: boolean) => {
      if (!settled) {
        settled = true;
        cleanup();
        resolve(result);
      }
    };

    const timeout = setTimeout(() => {
      finish(false);
    }, 10_000);

    rl.question(question, (answer) => {
      const a = (answer ?? '').trim().toLowerCase();
      finish(a === '' || a === 'y' || a === 'yes');
    });
  });
};

const closest = (target: string, possibilities: string[]): string | null => {
  let best: string | null = null;
  let bestDistance = Infinity;

  for (const id of possibilities) {
    const distance = levenshtein.get(target, id, { useCollator: true });
    if (distance < bestDistance) {
      bestDistance = distance;
      best = id;
    }
  }

  return best;
};

export default {
  closest,
  getConfirmation,
};
