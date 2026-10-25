import { beforeAll, describe, expect, it } from "vitest";
import { verifyAccess, type AccessDeps } from "./access";

const TEAM = "johnojo.cloudflareaccess.com";
const AUD = "a".repeat(64);
const NOW = Date.UTC(2026, 9, 25, 12, 0, 0);

let privateKey: CryptoKey;
let publicJwk: JsonWebKey;
let otherKey: CryptoKey;

const b64url = (bytes: Uint8Array | string) =>
  Buffer.from(typeof bytes === "string" ? new TextEncoder().encode(bytes) : bytes)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

async function newKeyPair() {
  return crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
}

beforeAll(async () => {
  const pair = await newKeyPair();
  privateKey = pair.privateKey;
  publicJwk = await crypto.subtle.exportKey("jwk", pair.publicKey);
  otherKey = (await newKeyPair()).privateKey;
});

/** Builds a token like Cloudflare Access does; tests override only the claim or header they're about. */
async function token({ claims = {}, header = {}, key = privateKey }: { claims?: Record<string, unknown>; header?: Record<string, unknown>; key?: CryptoKey } = {}) {
  const h = b64url(JSON.stringify({ alg: "RS256", kid: "k1", ...header }));
  const c = b64url(JSON.stringify({ iss: `https://${TEAM}`, aud: [AUD], exp: NOW / 1000 + 3600, nbf: NOW / 1000 - 10, ...claims }));
  const sig = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(`${h}.${c}`)));
  return `${h}.${c}.${b64url(sig)}`;
}

function deps(certs: () => Promise<Response> = async () => Response.json({ keys: [{ ...publicJwk, kid: "k1" }] })): AccessDeps & { calls: number } {
  const d = { calls: 0, now: () => NOW, cache: new Map(), fetch: (async () => (d.calls++, certs())) as unknown as typeof fetch };
  return d;
}

describe("verifyAccess", () => {
  it("verifyAccess_teamDomainNotConfigured_failsClosedWith500", async () => {
    expect(await verifyAccess(await token(), undefined, AUD, deps())).toEqual({ ok: false, status: 500, reason: "access-not-configured" });
  });

  it("verifyAccess_audienceNotConfigured_failsClosedWith500", async () => {
    expect(await verifyAccess(await token(), TEAM, "", deps())).toMatchObject({ ok: false, status: 500 });
  });

  it("verifyAccess_teamDomainNotCloudflare_failsClosed", async () => {
    expect(await verifyAccess(await token(), "evil.example.com", AUD, deps())).toMatchObject({ ok: false, status: 500 });
  });

  it("verifyAccess_noToken_denies", async () => {
    expect(await verifyAccess(null, TEAM, AUD, deps())).toEqual({ ok: false, status: 403, reason: "missing-token" });
  });

  it("verifyAccess_garbageToken_denies", async () => {
    expect(await verifyAccess("not.a.jwt", TEAM, AUD, deps())).toMatchObject({ ok: false, status: 403, reason: "malformed-token" });
  });

  it("verifyAccess_algNone_denies", async () => {
    const [, c] = (await token()).split(".");
    expect(await verifyAccess(`${b64url(JSON.stringify({ alg: "none", kid: "k1" }))}.${c}.`, TEAM, AUD, deps())).toMatchObject({ ok: false, reason: "unsupported-algorithm" });
  });

  it("verifyAccess_certsUnreachable_failsClosedWith503", async () => {
    const d = deps(async () => {
      throw new TypeError("network down");
    });
    expect(await verifyAccess(await token(), TEAM, AUD, d)).toEqual({ ok: false, status: 503, reason: "access-keys-unavailable" });
  });

  it("verifyAccess_certsServerError_failsClosedWith503", async () => {
    expect(await verifyAccess(await token(), TEAM, AUD, deps(async () => new Response("", { status: 502 })))).toMatchObject({ ok: false, status: 503 });
  });

  it("verifyAccess_signedByAnotherKey_denies", async () => {
    expect(await verifyAccess(await token({ key: otherKey }), TEAM, AUD, deps())).toMatchObject({ ok: false, status: 403, reason: "bad-signature" });
  });

  it("verifyAccess_tamperedClaims_denies", async () => {
    const [h, , s] = (await token()).split(".");
    const forged = b64url(JSON.stringify({ iss: `https://${TEAM}`, aud: [AUD], exp: NOW / 1000 + 99999 }));
    expect(await verifyAccess(`${h}.${forged}.${s}`, TEAM, AUD, deps())).toMatchObject({ ok: false, reason: "bad-signature" });
  });

  it("verifyAccess_unknownKeyId_refetchesOnceThenDenies", async () => {
    const d = deps();
    const result = await verifyAccess(await token({ header: { kid: "rotated" } }), TEAM, AUD, d);
    expect([result, d.calls]).toEqual([{ ok: false, status: 403, reason: "unknown-key" }, 2]);
  });

  it("verifyAccess_wrongAudience_denies", async () => {
    expect(await verifyAccess(await token({ claims: { aud: ["b".repeat(64)] } }), TEAM, AUD, deps())).toMatchObject({ ok: false, reason: "wrong-audience" });
  });

  it("verifyAccess_wrongIssuer_denies", async () => {
    expect(await verifyAccess(await token({ claims: { iss: "https://other.cloudflareaccess.com" } }), TEAM, AUD, deps())).toMatchObject({ ok: false, reason: "wrong-issuer" });
  });

  it("verifyAccess_expiredBeyondSkew_denies", async () => {
    expect(await verifyAccess(await token({ claims: { exp: NOW / 1000 - 61 } }), TEAM, AUD, deps())).toMatchObject({ ok: false, reason: "expired" });
  });

  it("verifyAccess_missingExpiry_denies", async () => {
    expect(await verifyAccess(await token({ claims: { exp: undefined } }), TEAM, AUD, deps())).toMatchObject({ ok: false, reason: "expired" });
  });

  it("verifyAccess_notYetValid_denies", async () => {
    expect(await verifyAccess(await token({ claims: { nbf: NOW / 1000 + 600 } }), TEAM, AUD, deps())).toMatchObject({ ok: false, reason: "not-yet-valid" });
  });

  it("verifyAccess_validToken_allows", async () => {
    expect(await verifyAccess(await token(), TEAM, AUD, deps())).toEqual({ ok: true });
  });

  it("verifyAccess_secondRequest_reusesCachedKeys", async () => {
    const d = deps();
    await verifyAccess(await token(), TEAM, AUD, d);
    await verifyAccess(await token(), TEAM, AUD, d);
    expect(d.calls).toBe(1);
  });
});
