/* VAPID-Schlüsselpaar erzeugen (einmalig ausführen):
     node generate-vapid-keys.mjs
   Ausgabe:
     VAPID_PUBLIC_KEY  → in wrangler.toml unter [vars] eintragen
     VAPID_PRIVATE_KEY → als Secret setzen: wrangler secret put VAPID_PRIVATE_KEY */

import { webcrypto as crypto } from "node:crypto";

const kp = await crypto.subtle.generateKey(
  { name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
const jwk = await crypto.subtle.exportKey("jwk", kp.privateKey);
const raw = new Uint8Array(await crypto.subtle.exportKey("raw", kp.publicKey));

const b64u = b => Buffer.from(b).toString("base64url");

if (process.argv[2] === "raw") {
  // Maschinenformat für deploy.sh: Zeile 1 = Public, Zeile 2 = Private
  console.log(b64u(raw));
  console.log(jwk.d);
} else {
  console.log("VAPID_PUBLIC_KEY:");
  console.log("  " + b64u(raw));
  console.log("");
  console.log("VAPID_PRIVATE_KEY (geheim halten!):");
  console.log("  " + jwk.d);
}
