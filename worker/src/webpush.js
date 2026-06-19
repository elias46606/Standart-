/* Web-Push für Cloudflare Workers – ohne Fremd-Library.
   RFC 8291 (aes128gcm-Verschlüsselung) + RFC 8292 (VAPID).
   Die Node-Library "web-push" läuft auf Workers nicht; WebCrypto kann
   aber alles Nötige: ECDH P-256, HKDF, AES-GCM, ECDSA (ES256). */

const te = new TextEncoder();

export const b64uToBytes = s => {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  const pad = s.length % 4 ? 4 - (s.length % 4) : 0;
  const bin = atob(s + "=".repeat(pad));
  return Uint8Array.from(bin, c => c.charCodeAt(0));
};

export const bytesToB64u = b => {
  const u = new Uint8Array(b);
  let s = "";
  for (const x of u) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

const concat = (...arrs) => {
  const out = new Uint8Array(arrs.reduce((n, a) => n + a.length, 0));
  let o = 0;
  for (const a of arrs) { out.set(a, o); o += a.length; }
  return out;
};

async function hkdf(salt, ikm, info, len) {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt, info }, key, len * 8));
}

// Payload nach RFC 8291 verschlüsseln (eine Record, rs = 4096)
async function encryptPayload(subscription, payloadStr) {
  const clientPub  = b64uToBytes(subscription.keys.p256dh); // 65 Byte (0x04||x||y)
  const authSecret = b64uToBytes(subscription.keys.auth);   // 16 Byte

  const asKeys = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const asPub = new Uint8Array(await crypto.subtle.exportKey("raw", asKeys.publicKey));

  const clientKey = await crypto.subtle.importKey(
    "raw", clientPub, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const ecdhSecret = new Uint8Array(await crypto.subtle.deriveBits(
    { name: "ECDH", public: clientKey }, asKeys.privateKey, 256));

  const keyInfo = concat(te.encode("WebPush: info\0"), clientPub, asPub);
  const ikm   = await hkdf(authSecret, ecdhSecret, keyInfo, 32);
  const salt  = crypto.getRandomValues(new Uint8Array(16));
  const cek   = await hkdf(salt, ikm, te.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, te.encode("Content-Encoding: nonce\0"), 12);

  // Letzte (einzige) Record endet mit Padding-Delimiter 0x02
  const plaintext = concat(te.encode(payloadStr), new Uint8Array([2]));
  const aesKey = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce }, aesKey, plaintext));

  // Header: salt(16) | rs(4) | idlen(1) | keyid(65 = Server-Pubkey)
  const header = new Uint8Array(16 + 4 + 1 + asPub.length);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, 4096);
  header[20] = asPub.length;
  header.set(asPub, 21);
  return concat(header, ciphertext);
}

// VAPID-JWT (ES256) für den Push-Dienst des Browsers
async function vapidAuthHeader(endpoint, env) {
  const aud = new URL(endpoint).origin;
  const exp = Math.floor(Date.now() / 1000) + 12 * 3600;

  const pub = b64uToBytes(env.VAPID_PUBLIC_KEY);
  const jwk = {
    kty: "EC", crv: "P-256",
    d: env.VAPID_PRIVATE_KEY,
    x: bytesToB64u(pub.slice(1, 33)),
    y: bytesToB64u(pub.slice(33, 65)),
  };
  const key = await crypto.subtle.importKey(
    "jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);

  const head = bytesToB64u(te.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const body = bytesToB64u(te.encode(JSON.stringify({ aud, exp, sub: env.VAPID_SUBJECT })));
  const sig = new Uint8Array(await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" }, key, te.encode(`${head}.${body}`)));

  return `vapid t=${head}.${body}.${bytesToB64u(sig)}, k=${env.VAPID_PUBLIC_KEY}`;
}

/* Push an eine Subscription senden.
   Rückgabe: Response des Push-Dienstes (404/410 = Subscription tot). */
export async function sendWebPush(env, subscription, payloadObj) {
  const body = await encryptPayload(subscription, JSON.stringify(payloadObj));
  return fetch(subscription.endpoint, {
    method: "POST",
    headers: {
      Authorization: await vapidAuthHeader(subscription.endpoint, env),
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      TTL: "300",
      Urgency: "high",
    },
    body,
  });
}
