const ALG = { name: 'AES-GCM', length: 256 } as const;

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

/**
 * Load the encryption key from the server-stored JWK, or generate a new one.
 * Returns { key, jwk } where jwk is non-null only when a new key was generated
 * (the caller must save it to the server).
 *
 * If no server key exists, falls back to any localStorage key from the old
 * per-browser scheme so existing rows can still be decrypted.
 */
export async function getOrCreateKey(
  serverJwk: string | null,
): Promise<{ key: CryptoKey; jwk: string | null }> {
  // Server-stored key (shared across all deployments / devices)
  if (serverJwk) {
    const key = await crypto.subtle.importKey('jwk', JSON.parse(serverJwk), ALG, true, ['encrypt', 'decrypt']);
    return { key, jwk: null };
  }

  // Migration: if the old per-browser localStorage key exists, promote it to server
  const localJwk = typeof localStorage !== 'undefined' ? localStorage.getItem('gippidy-key') : null;
  if (localJwk) {
    const key = await crypto.subtle.importKey('jwk', JSON.parse(localJwk), ALG, true, ['encrypt', 'decrypt']);
    return { key, jwk: localJwk }; // caller saves this to server
  }

  // First use: generate a new key and return it for the caller to persist
  const key = await crypto.subtle.generateKey(ALG, true, ['encrypt', 'decrypt']);
  const jwk = JSON.stringify(await crypto.subtle.exportKey('jwk', key));
  return { key, jwk };
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
