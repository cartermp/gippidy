type Fields = Record<string, string | number | boolean | undefined>;

export function log(event: string, fields: Fields): void {
  const parts = Object.entries(fields)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${k}=${v}`);
  console.log(`[${event}] ${parts.join(' ')}`);
}
