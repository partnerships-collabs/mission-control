export function hasValidActivityToken(
  req: Request,
  expected: string | undefined,
): boolean {
  const authorization = req.headers.get("authorization");
  const token =
    req.headers.get("x-activity-secret") ??
    req.headers.get("x-activity-token") ??
    (authorization?.startsWith("Bearer ") ? authorization.slice(7) : null);
  return Boolean(expected && token && token === expected);
}

function hexToBytes(value: string): ArrayBuffer | null {
  if (!/^[0-9a-f]+$/i.test(value) || value.length % 2 !== 0) return null;
  return new Uint8Array(
    value.match(/.{2}/g)?.map((byte) => Number.parseInt(byte, 16)) ?? [],
  ).buffer;
}

export async function verifyCloseWebhookSignature(
  req: Request,
  body: string,
  signatureKey: string,
): Promise<boolean> {
  const receivedHash = req.headers.get("close-sig-hash")?.trim().toLowerCase();
  const timestamp = req.headers.get("close-sig-timestamp");
  const keyBytes = hexToBytes(signatureKey);
  if (!receivedHash || !timestamp || !keyBytes) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(timestamp + body),
  );
  const expectedHash = Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

  if (receivedHash.length !== expectedHash.length) return false;
  let difference = 0;
  for (let index = 0; index < expectedHash.length; index += 1) {
    difference |= receivedHash.charCodeAt(index) ^ expectedHash.charCodeAt(index);
  }
  return difference === 0;
}
