/**
 * Secret Santa assignment logic
 *
 * Exactly 4 couples, 8 participants.
 *
 * Constraints:
 * - Each participant gives exactly 2 gifts.
 * - Each participant receives exactly 2 gifts.
 * - Nobody gives to themselves or their partner.
 * - Each giver's 2 recipients belong to different couples.
 * - No duplicate recipients.
 *
 * Rejection sampling produces a uniform distribution
 * over all valid complete assignments.
 */

const CHECK_DEFINITIONS = [
  { id: "valid-participants", label: "Valid participant configuration" },
  { id: "two-outgoing", label: "Two outgoing gifts" },
  { id: "two-incoming", label: "Two incoming gifts" },
  { id: "no-self", label: "No self-assignment" },
  { id: "no-partner", label: "No partner assignments" },
  { id: "distinct-couples", label: "Distinct recipient couples" },
  { id: "no-duplicates", label: "No duplicate recipients" },
  { id: "complete", label: "Complete assignment" }
];

function randomInt(max) {
  if (!Number.isSafeInteger(max) || max <= 0 || max > 0x100000000) {
    throw new RangeError("Invalid random integer bound.");
  }

  const range = 0x100000000;
  const limit = range - (range % max);
  const values = new Uint32Array(1);

  do {
    crypto.getRandomValues(values);
  } while (values[0] >= limit);

  return values[0] % max;
}

/**
 * Validate the input couples configuration independently.
 */
function validateCouples(couples) {
  const errors = [];

  if (!Array.isArray(couples) || couples.length !== 4) {
    return {
      valid: false,
      errors: ["Exactly 4 couples are required."]
    };
  }

  const names = new Set();
  const ids = new Set();

  for (let i = 0; i < couples.length; i++) {
    const couple = couples[i];

    if (!couple || !Array.isArray(couple.members) ||
        couple.members.length !== 2) {
      errors.push(`Couple ${i + 1} must contain exactly 2 members.`);
      continue;
    }

    if (typeof couple.id !== "string" || !couple.id.trim() ||
        ids.has(couple.id)) {
      errors.push(`Couple ${i + 1} has an invalid or duplicate ID.`);
    } else {
      ids.add(couple.id);
    }

    for (const name of couple.members) {
      if (typeof name !== "string" || !name.trim()) {
        errors.push(`Couple ${i + 1} contains an invalid name.`);
      } else if (names.has(name)) {
        errors.push(`Duplicate participant name: ${name}`);
      } else {
        names.add(name);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

function note(passed, text) {
  return { passed, text };
}

function showName(value) {
  if (typeof value !== "string" || value.trim() === "") {
    return "invalid recipient";
  }
  return value;
}

function giftCount(count) {
  return count === 1 ? "1 gift" : `${count} gifts`;
}

function coupleLabel(couple) {
  if (!couple || !Array.isArray(couple.members)) {
    return "unknown couple";
  }
  const members = couple.members.filter((name) => typeof name === "string" && name.trim() !== "");
  if (members.length === 2) {
    return `${members[0]} & ${members[1]}`;
  }
  return typeof couple.id === "string" && couple.id.trim() !== "" ? couple.id : "unknown couple";
}

function validationResult(errors, rowSets) {
  const checks = CHECK_DEFINITIONS.map((check) => {
    const details = rowSets[check.id] || [];
    return {
      id: check.id,
      label: check.label,
      passed: details.length > 0 && details.every((row) => row.passed),
      details
    };
  });

  return {
    valid: checks.every((check) => check.passed),
    errors,
    checks
  };
}

function participantRows(couples) {
  const rows = [];
  const list = Array.isArray(couples) ? couples : [];

  if (!Array.isArray(couples) || couples.length !== 4) {
    rows.push(note(false, "Exactly 4 couples are required."));
  }

  const seenNames = new Set();
  const seenIds = new Set();

  list.forEach((couple, index) => {
    const problems = [];
    const members = couple && Array.isArray(couple.members) ? couple.members : null;
    const id = couple && typeof couple.id === "string" && couple.id.trim() !== "" ? couple.id : "";

    if (!members || members.length !== 2) {
      problems.push("must contain exactly 2 members");
    } else {
      members.forEach((name) => {
        if (typeof name !== "string" || name.trim() === "") {
          problems.push("invalid name");
        } else if (seenNames.has(name)) {
          problems.push(`duplicate name ${name}`);
        } else {
          seenNames.add(name);
        }
      });
    }

    if (!couple || typeof couple.id !== "string" || couple.id.trim() === "" || seenIds.has(couple.id)) {
      if (members && members.length === 2) {
        problems.push("invalid or duplicate id");
      }
    } else {
      seenIds.add(couple.id);
    }

    const shownMembers = members
      ? members.map((name) => (typeof name === "string" && name.trim() !== "" ? name : "invalid name")).join(", ")
      : "invalid members";
    const label = id || `Couple ${index + 1}`;
    rows.push(note(
      problems.length === 0,
      problems.length === 0 ? `${label}: ${shownMembers}` : `${label}: ${shownMembers} (${problems.join("; ")})`
    ));
  });

  return rows;
}

function blockedRows(text) {
  return Object.fromEntries(CHECK_DEFINITIONS.map((check) => [
    check.id,
    check.id === "valid-participants" ? null : [note(false, text)]
  ]));
}

function recipientSlots(recipients, giver, describe) {
  const list = Array.isArray(recipients) ? recipients : [];
  const count = Math.max(list.length, 2);
  const rows = [];

  for (let index = 0; index < count; index += 1) {
    if (!Array.isArray(recipients) || index >= list.length || typeof list[index] !== "string" || list[index].trim() === "") {
      rows.push(note(false, `${giver} → missing recipient`));
      continue;
    }
    rows.push(describe(list[index]));
  }

  return rows;
}

function outgoingRow(giver, recipients) {
  if (!Array.isArray(recipients)) {
    return note(false, `${giver}: assignment is missing`);
  }
  const names = recipients.map(showName);
  if (recipients.length === 2) {
    return note(true, `${giver} → ${names[0]}, ${names[1]} (2 gifts)`);
  }
  if (recipients.length === 0) {
    return note(false, `${giver}: no recipients (0 gifts)`);
  }
  return note(false, `${giver} → ${names.join(", ")} (${giftCount(recipients.length)})`);
}

/**
 * Independently validate a complete assignment.
 * Each check's passed flag is the result of its individual rows.
 *
 * @returns {{valid: boolean, errors: string[], checks: Array<{id: string, label: string, passed: boolean, details: Array<{passed: boolean, text: string}>}>}}
 */
export function validateAssignments(couples, assignments) {
  const input = validateCouples(couples);
  const participants = participantRows(couples);

  if (!input.valid) {
    const rowSets = blockedRows("Participant configuration is invalid.");
    rowSets["valid-participants"] = participants;
    return validationResult(input.errors, rowSets);
  }

  const errors = [];
  const people = couples.flatMap(c => c.members);
  const pairOf = new Map();

  couples.forEach((couple, i) => {
    couple.members.forEach(name => pairOf.set(name, i));
  });

  if (!assignments || typeof assignments !== "object" ||
      Array.isArray(assignments)) {
    const message = "Assignments must be an object.";
    errors.push(message);
    return validationResult(errors, {
      "valid-participants": participants,
      "two-outgoing": people.map((giver) => note(false, `${giver}: assignment is missing`)),
      "two-incoming": people.map((person) => note(false, `${person} ← nobody (0 gifts)`)),
      "no-self": people.flatMap((giver) => recipientSlots(undefined, giver, () => note(false, ""))),
      "no-partner": people.flatMap((giver) => recipientSlots(undefined, giver, () => note(false, ""))),
      "distinct-couples": people.map((giver) => note(false, `${giver}: recipients are missing`)),
      "no-duplicates": people.map((giver) => note(false, `${giver}: expected 2 recipients to compare`)),
      "complete": people.map((giver) => note(false, `${giver}: missing`))
    });
  }

  const partnerOf = new Map();
  couples.forEach((couple) => {
    partnerOf.set(couple.members[0], couple.members[1]);
    partnerOf.set(couple.members[1], couple.members[0]);
  });

  const incoming = new Map(people.map(name => [name, []]));

  const outgoing = [];
  const selfRows = [];
  const partnerRows = [];
  const distinctRows = [];
  const duplicateRows = [];
  const completeRows = [];

  for (const giver of people) {
    const recipients = Object.hasOwn(assignments, giver)
      ? assignments[giver]
      : undefined;

    outgoing.push(outgoingRow(giver, recipients));
    selfRows.push(...recipientSlots(recipients, giver, (recipient) => (
      recipient === giver
        ? note(false, `${giver} → ${recipient} (is ${giver})`)
        : note(true, `${giver} → ${recipient} (not ${giver})`)
    )));
    partnerRows.push(...recipientSlots(recipients, giver, (recipient) => {
      const partner = partnerOf.get(giver);
      return recipient === partner
        ? note(false, `${giver} → ${recipient} (is partner ${partner})`)
        : note(true, `${giver} → ${recipient} (not partner ${partner})`);
    }));

    if (!Array.isArray(recipients) || recipients.length !== 2) {
      const message = `${giver} must have exactly 2 recipients.`;
      errors.push(message);
      if (!Array.isArray(recipients) || recipients.length === 0) {
        distinctRows.push(note(false, `${giver}: recipients are missing`));
      } else {
        distinctRows.push(note(false, `${giver} → ${recipients.map(showName).join(", ")} (expected 2 recipients from different couples)`));
      }
      duplicateRows.push(note(false, `${giver}: expected 2 recipients to compare`));
      completeRows.push(completePersonRow(giver, recipients, pairOf));
      continue;
    }

    if (new Set(recipients).size !== 2) {
      const message = `${giver} has duplicate recipients.`;
      errors.push(message);
      duplicateRows.push(note(false, `${giver}: ${showName(recipients[0])} = ${showName(recipients[1])}`));
    } else {
      duplicateRows.push(note(true, `${giver}: ${showName(recipients[0])} ≠ ${showName(recipients[1])}`));
    }

    const recipientPairs = [];

    for (const recipient of recipients) {
      if (typeof recipient !== "string" || !pairOf.has(recipient)) {
        const message = `${giver} has an unknown recipient.`;
        errors.push(message);
        continue;
      }

      if (recipient === giver) {
        errors.push(`${giver} is assigned themselves.`);
      }

      if (pairOf.get(recipient) === pairOf.get(giver)) {
        errors.push(`${giver} is assigned someone from their own couple.`);
      }

      recipientPairs.push(pairOf.get(recipient));
      incoming.get(recipient).push(giver);
    }

    const firstKnown = typeof recipients[0] === "string" && pairOf.has(recipients[0]);
    const secondKnown = typeof recipients[1] === "string" && pairOf.has(recipients[1]);
    if (!firstKnown || !secondKnown) {
      distinctRows.push(note(
        false,
        `${giver} → ${showName(recipients[0])}, ${showName(recipients[1])} (unknown participant)`
      ));
    } else {
      const sameCouple = recipientPairs[0] === recipientPairs[1];
      const left = `${recipients[0]} (${coupleLabel(couples[pairOf.get(recipients[0])])})`;
      const right = `${recipients[1]} (${coupleLabel(couples[pairOf.get(recipients[1])])})`;
      distinctRows.push(note(
        !sameCouple,
        sameCouple
          ? `${giver} → ${left}, ${right} (same couple)`
          : `${giver} → ${left}, ${right}`
      ));
    }

    if (recipientPairs.length === 2 && recipientPairs[0] === recipientPairs[1]) {
      errors.push(`${giver}'s recipients belong to the same couple.`);
    }

    completeRows.push(completePersonRow(giver, recipients, pairOf));
  }

  for (const giver of Object.keys(assignments)) {
    if (!pairOf.has(giver)) {
      const message = `Unknown giver: ${giver}`;
      errors.push(message);
      completeRows.push(note(false, `Unexpected giver: ${giver}`));
    }
  }

  const incomingRows = people.map((person) => {
    const givers = incoming.get(person);
    if (givers.length !== 2) {
      errors.push(`${person} receives ${givers.length} gifts instead of 2.`);
    }
    const from = givers.length === 0 ? "nobody" : givers.join(", ");
    return note(givers.length === 2, `${person} ← ${from} (${giftCount(givers.length)})`);
  });

  return validationResult(errors, {
    "valid-participants": participants,
    "two-outgoing": outgoing,
    "two-incoming": incomingRows,
    "no-self": selfRows,
    "no-partner": partnerRows,
    "distinct-couples": distinctRows,
    "no-duplicates": duplicateRows,
    complete: completeRows
  });
}

function completePersonRow(giver, recipients, pairOf) {
  if (!Array.isArray(recipients)) {
    return note(false, `${giver}: missing`);
  }

  const parts = ["present"];
  let ok = recipients.length === 2;
  const slots = Math.max(recipients.length, 2);

  for (let index = 0; index < slots; index += 1) {
    if (index >= recipients.length) {
      ok = false;
      parts.push("missing recipient");
      continue;
    }
    const recipient = recipients[index];
    if (typeof recipient === "string" && pairOf.has(recipient)) {
      parts.push(`${recipient} valid`);
    } else if (typeof recipient === "string" && recipient.trim() !== "") {
      ok = false;
      parts.push(`${recipient} invalid`);
    } else {
      ok = false;
      parts.push("missing recipient");
    }
  }

  if (recipients.length > 2) {
    ok = false;
    parts.push(`expected 2 recipients, found ${recipients.length}`);
  }

  return note(ok, `${giver}: ${parts.join("; ")}`);
}

/**
 * Generate a uniformly random valid assignment.
 *
 * Each giver independently samples one of 12 equally likely
 * recipient combinations. Reject complete assignments that
 * fail validation.
 *
 * @returns {Object<string, string[]>}
 */
export function generateAssignments(couples) {
  const input = validateCouples(couples);

  if (!input.valid) {
    throw new Error(input.errors.join("; "));
  }

  const people = couples.flatMap(c => c.members);
  const options = new Map();

  // Construct all 12 possible recipient combinations per giver.
  for (let ownPair = 0; ownPair < couples.length; ownPair++) {
    const otherPairs = couples.filter((_, i) => i !== ownPair);
    const choices = [];

    for (let a = 0; a < otherPairs.length; a++) {
      for (let b = a + 1; b < otherPairs.length; b++) {
        for (const personA of otherPairs[a].members) {
          for (const personB of otherPairs[b].members) {
            choices.push([personA, personB]);
          }
        }
      }
    }

    for (const giver of couples[ownPair].members) {
      options.set(giver, choices);
    }
  }

  const MAX_ATTEMPTS = 100000;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const assignments = Object.create(null);

    for (const giver of people) {
      const choices = options.get(giver);
      assignments[giver] = choices[randomInt(choices.length)].slice();
    }

    if (validateAssignments(couples, assignments).valid) {
      return assignments;
    }
  }

  throw new Error(
    `Failed to generate a valid assignment after ${MAX_ATTEMPTS} attempts.`
  );
}
