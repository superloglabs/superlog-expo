export type SessionIdFactory = () => string;

export function createSessionId(now: Date = new Date(), random = defaultRandom): string {
  const timestamp = now.toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  return `ses_${timestamp}_${random(12)}`;
}

function defaultRandom(length: number): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let out = "";
  const cryptoObject = globalThis.crypto;
  if (cryptoObject?.getRandomValues) {
    const bytes = new Uint8Array(length);
    cryptoObject.getRandomValues(bytes);
    for (const byte of bytes) out += alphabet[byte % alphabet.length];
    return out;
  }
  for (let i = 0; i < length; i += 1) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}
