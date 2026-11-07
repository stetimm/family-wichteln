/**
 * Co-giver coordination for existing Secret Santa links.
 *
 * Each participant key is SHA-256 of a fixed label, their name, and their
 * two recipients in link order. The set of possible assignments is small,
 * so this only hides co-giver names from casual reading. It is not strong
 * secrecy, and it must not be described as high security.
 *
 * Recipient order is the order stored in the result link. Encryption and
 * decryption both start from that decoded order.
 */

export const COORDINATION_VERSION = 1;

const KEY_DOMAIN = "secret-santa-cogiver-v1";
const LOOKUP_DOMAIN = "secret-santa-cogiver-lookup-v1";

/**
 * @param {Array<{name: string, recipients: string[]}>} payloads
 * @returns {Object<string, string[]>}
 */
export function reconstructAssignment(payloads) {
  if (!Array.isArray(payloads)) {
    throw new Error("No links were imported.");
  }

  const assignment = Object.create(null);
  payloads.forEach((payload) => {
    assertPayload(payload);
    if (Object.hasOwn(assignment, payload.name)) {
      throw new Error(`"${payload.name}" appears more than once.`);
    }
    assignment[payload.name] = payload.recipients.slice();
  });
  return assignment;
}

/**
 * @param {Object<string, string[]>} assignments
 * @returns {Map<string, Object<string, string>>}
 */
export function buildCoGiverMapping(assignments) {
  if (!assignments || typeof assignments !== "object" || Array.isArray(assignments)) {
    throw new Error("The assignment could not be reconstructed.");
  }

  const givers = Object.keys(assignments);
  if (givers.length !== 8) {
    throw new Error(`The assignment includes ${givers.length} participants instead of 8.`);
  }

  /** @type {Map<string, string[]>} */
  const giversOf = new Map();

  givers.forEach((giver) => {
    const recipients = assignments[giver];
    if (!Array.isArray(recipients) || recipients.length !== 2) {
      throw new Error("Every participant must have exactly two recipients.");
    }
    if (recipients[0] === recipients[1]) {
      throw new Error("A participant is assigned the same recipient twice.");
    }

    recipients.forEach((recipient) => {
      if (typeof recipient !== "string" || recipient.trim() === "") {
        throw new Error("A recipient name is missing.");
      }
      if (!giversOf.has(recipient)) {
        giversOf.set(recipient, []);
      }
      giversOf.get(recipient).push(giver);
    });
  });

  givers.forEach((giver) => {
    if (!giversOf.has(giver)) {
      throw new Error("Every participant must receive gifts from exactly two people.");
    }
  });

  if (giversOf.size !== givers.length) {
    throw new Error("Every recipient must have exactly two distinct givers.");
  }

  giversOf.forEach((list, recipient) => {
    if (!Object.hasOwn(assignments, recipient)) {
      throw new Error("A recipient is outside the imported assignment.");
    }
    if (list.length !== 2 || new Set(list).size !== 2) {
      throw new Error("Every recipient must have exactly two distinct givers.");
    }
  });

  /** @type {Map<string, Object<string, string>>} */
  const mapping = new Map();

  givers.forEach((giver) => {
    const coGivers = Object.create(null);
    assignments[giver].forEach((recipient) => {
      const other = giversOf.get(recipient).find((name) => name !== giver);
      if (!other) {
        throw new Error("A co-giver relationship is missing.");
      }
      coGivers[recipient] = other;
    });
    if (Object.keys(coGivers).length !== 2) {
      throw new Error("Every participant must have exactly two co-giver relationships.");
    }
    mapping.set(giver, coGivers);
  });

  return mapping;
}

/**
 * @param {{name: string, recipients: string[]}} payload
 * @param {string[]} [usages]
 */
export async function deriveParticipantKey(payload, usages = ["encrypt", "decrypt"]) {
  const material = await digestParticipant(KEY_DOMAIN, payload);
  return crypto.subtle.importKey(
    "raw",
    material,
    { name: "AES-GCM" },
    false,
    usages
  );
}

/**
 * @param {{name: string, recipients: string[]}} payload
 * @returns {Promise<string>}
 */
export async function deriveLookupId(payload) {
  const material = await digestParticipant(LOOKUP_DOMAIN, payload);
  return bytesToHex(new Uint8Array(material));
}

/**
 * Encrypts only the two co-giver names, in the participant's link order.
 *
 * @param {{name: string, recipients: string[]}} payload
 * @param {Object<string, string>} coGivers
 * @returns {Promise<{iv: string, ciphertext: string}>}
 */
export async function encryptCoordinationData(payload, coGivers) {
  const plaintext = JSON.stringify(coGiverNames(payload, coGivers));
  const key = await deriveParticipantKey(payload, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(plaintext)
  ));

  return {
    iv: encodeBase64Url(iv),
    ciphertext: encodeBase64Url(ciphertext)
  };
}

/**
 * @param {{name: string, recipients: string[]}} payload
 * @param {{iv: string, ciphertext: string}} entry
 * @returns {Promise<Object<string, string>>}
 */
export async function decryptCoordinationData(payload, entry) {
  assertPayload(payload);
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    throw new Error("Encrypted entry is missing.");
  }
  if (typeof entry.iv !== "string" || typeof entry.ciphertext !== "string") {
    throw new Error("Encrypted entry is incomplete.");
  }

  const iv = decodeBase64Url(entry.iv);
  const ciphertext = decodeBase64Url(entry.ciphertext);
  if (iv.length !== 12 || ciphertext.length < 16) {
    throw new Error("Encrypted entry is incomplete.");
  }

  const key = await deriveParticipantKey(payload, ["decrypt"]);
  let plainBytes;
  try {
    plainBytes = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      key,
      ciphertext
    );
  } catch {
    throw new Error("Coordination data could not be opened.");
  }

  let parsed;
  try {
    parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(plainBytes));
  } catch {
    throw new Error("Coordination data could not be opened.");
  }

  if (!Array.isArray(parsed) || parsed.length !== 2) {
    throw new Error("Coordination data has an unexpected shape.");
  }

  const coGivers = Object.create(null);
  parsed.forEach((name, index) => {
    if (typeof name !== "string" || name.trim() === "" || name !== name.trim()) {
      throw new Error("Coordination data has an unexpected shape.");
    }
    const recipient = payload.recipients[index];
    if (name === payload.name || name === recipient) {
      throw new Error("Coordination data has an unexpected shape.");
    }
    coGivers[recipient] = name;
  });
  return coGivers;
}

/**
 * Builds version 1 of coordination.json after a decrypt round-trip.
 * Does not draw a new assignment.
 *
 * @param {Array<{name: string, recipients: string[]}>} payloads
 * @param {Object<string, string[]>} assignments
 * @returns {Promise<string>}
 */
export async function generateCoordinationFile(payloads, assignments) {
  if (!Array.isArray(payloads) || payloads.length !== 8) {
    throw new Error("Exactly eight links are required.");
  }

  const seen = new Set();
  payloads.forEach((payload) => {
    assertPayload(payload);
    if (seen.has(payload.name)) {
      throw new Error(`"${payload.name}" appears more than once.`);
    }
    seen.add(payload.name);

    const assigned = assignments && Object.hasOwn(assignments, payload.name)
      ? assignments[payload.name]
      : undefined;
    if (!Array.isArray(assigned) ||
        assigned.length !== 2 ||
        assigned[0] !== payload.recipients[0] ||
        assigned[1] !== payload.recipients[1]) {
      throw new Error("The links do not match the reconstructed assignment.");
    }
  });

  if (!assignments || Object.keys(assignments).length !== 8) {
    throw new Error("The assignment could not be reconstructed.");
  }

  const mapping = buildCoGiverMapping(assignments);
  const entries = Object.create(null);
  const lookupIds = [];

  for (const payload of payloads) {
    const lookupId = await deriveLookupId(payload);
    if (Object.hasOwn(entries, lookupId)) {
      throw new Error("Lookup identifiers are not unique.");
    }

    const expected = mapping.get(payload.name);
    if (!expected || payload.recipients.some((recipient) => typeof expected[recipient] !== "string")) {
      throw new Error("Every participant must have exactly two co-giver relationships.");
    }

    const entry = await encryptCoordinationData(payload, expected);
    const opened = await decryptCoordinationData(payload, entry);
    const matches = payload.recipients.every((recipient) => opened[recipient] === expected[recipient]);
    if (!matches) {
      throw new Error("Encrypted coordination data did not match the imported assignment.");
    }

    entries[lookupId] = entry;
    lookupIds.push(lookupId);
  }

  if (lookupIds.length !== 8) {
    throw new Error("The coordination file must contain exactly eight entries.");
  }

  const ordered = Object.create(null);
  lookupIds.sort().forEach((lookupId) => {
    ordered[lookupId] = entries[lookupId];
  });

  return `${JSON.stringify({
    version: COORDINATION_VERSION,
    entries: ordered
  }, null, 2)}\n`;
}

function canonicalParticipant(domain, payload) {
  return JSON.stringify([
    domain,
    payload.name,
    payload.recipients[0],
    payload.recipients[1]
  ]);
}

async function digestParticipant(domain, payload) {
  assertPayload(payload);
  return crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(canonicalParticipant(domain, payload))
  );
}

function coGiverNames(payload, coGivers) {
  if (!coGivers || typeof coGivers !== "object" || Array.isArray(coGivers)) {
    throw new Error("A co-giver relationship is missing.");
  }
  return payload.recipients.map((recipient) => {
    const name = coGivers[recipient];
    if (typeof name !== "string" || name.trim() === "" || name !== name.trim()) {
      throw new Error("A co-giver name is missing.");
    }
    if (name === payload.name || name === recipient) {
      throw new Error("A co-giver relationship is invalid.");
    }
    return name;
  });
}

function assertPayload(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("A link could not be read.");
  }
  if (typeof payload.name !== "string" || payload.name.trim() === "" || payload.name !== payload.name.trim()) {
    throw new Error("A participant name is missing.");
  }
  if (!Array.isArray(payload.recipients) || payload.recipients.length !== 2) {
    throw new Error(`"${payload.name}" does not have two recipients.`);
  }
  payload.recipients.forEach((recipient) => {
    if (typeof recipient !== "string" || recipient.trim() === "" || recipient !== recipient.trim()) {
      throw new Error(`"${payload.name}" has a missing recipient.`);
    }
  });
}

function bytesToHex(bytes) {
  let hex = "";
  bytes.forEach((byte) => {
    hex += byte.toString(16).padStart(2, "0");
  });
  return hex;
}

function encodeBase64Url(bytes) {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeBase64Url(encoded) {
  if (typeof encoded !== "string" || !/^[A-Za-z0-9_-]*$/.test(encoded)) {
    throw new Error("Invalid encoding");
  }
  const padded = encoded + "=".repeat((4 - (encoded.length % 4)) % 4);
  const binary = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}
