const KEY_STORE = 'gippidy-key';
const ALG = { name: 'AES-GCM', length: 256 } as const;

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

let keyPromise: Promise<CryptoKey> | null = null;

export function getOrCreateKey(): Promise<CryptoKey> {
  if (!keyPromise) {
    keyPromise = (async () => {
      const stored = localStorage.getItem(KEY_STORE);
      if (stored) {
        return crypto.subtle.importKey('jwk', JSON.parse(stored), ALG, true, ['encrypt', 'decrypt']);
      }
      const key = await crypto.subtle.generateKey(ALG, true, ['encrypt', 'decrypt']);
      const jwk = await crypto.subtle.exportKey('jwk', key);
      localStorage.setItem(KEY_STORE, JSON.stringify(jwk));
      return key;
    })();
  }
  return keyPromise;
}

export async function encrypt(key: CryptoKey, data: unknown): Promise<{ iv: string; ciphertext: string }> {
  const iv      = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(JSON.stringify(data));
  const buf     = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);
  return {
    iv:         uint8ToBase64(iv),
    ciphertext: uint8ToBase64(new Uint8Array(buf)),
  };
}

export async function decrypt<T>(key: CryptoKey, iv: string, ciphertext: string): Promise<T> {
  const ivBuf = Uint8Array.from(atob(iv), c => c.charCodeAt(0));
  const ctBuf = Uint8Array.from(atob(ciphertext), c => c.charCodeAt(0));
  const buf   = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: ivBuf }, key, ctBuf);
  return JSON.parse(new TextDecoder().decode(buf));
}
