export function cn(...inputs: unknown[]): string {
  return inputs.filter((v) => typeof v === 'string' && v.length > 0).join(' ');
}
