import { generateAssignments, validateAssignments } from "./assignment.js";

const DEFAULT_COUPLES_TEXT = [
  "pair1, Anton, Berta",
  "pair2, Carl, Dora",
  "pair3, Detlef, Emilia",
  "pair4, Franz, Gerda"
].join("\n");

const RESULT_VERSION = 1;
const RESULT_HASH_PREFIX = "#result=";

document.addEventListener("DOMContentLoaded", () => {
  const organizer = document.querySelector("#organizer");
  const participant = document.querySelector("#participant");
  const resultError = document.querySelector("#result-error");
  const couplesInput = document.querySelector("#couples");
  const generateButton = document.querySelector("#generate");
  const testingInput = document.querySelector("#testing-mode");
  const downloadButton = document.querySelector("#download");
  const messageBox = document.querySelector("#message");
  const distribution = document.querySelector("#distribution");
  const distributionHeading = document.querySelector("#distribution-heading");
  const linkRows = document.querySelector("#link-rows");
  const testResult = document.querySelector("#test-result");
  const testHeading = document.querySelector("#test-heading");
  const assignmentRows = document.querySelector("#assignment-rows");
  const validationChecks = document.querySelector("#validation-checks");
  const validationSummary = document.querySelector("#validation-summary");
  const greeting = document.querySelector("#greeting");
  const recipientList = document.querySelector("#recipients");
  const resultErrorText = document.querySelector("#result-error-text");
  const status = document.querySelector("#status");

  /** @type {{entries: Array<{name: string, url: string}>, downloaded: boolean} | null} */
  let activeDraw = null;

  couplesInput.value = DEFAULT_COUPLES_TEXT;
  document.title = "Secret Santa";

  generateButton.addEventListener("click", onGenerate);
  testingInput.addEventListener("change", onTestingModeChange);
  downloadButton.addEventListener("click", onDownload);
  window.addEventListener("hashchange", showCurrentView);
  window.addEventListener("beforeunload", onBeforeUnload);

  showCurrentView();

  function showCurrentView() {
    document.title = "Secret Santa";
    const token = readResultToken(window.location.hash);
    if (token === null) {
      showOnly(organizer);
      return;
    }

    try {
      showParticipant(decodeResultPayload(token));
    } catch (error) {
      showResultProblem(resultProblemMessage(error));
    }
  }

  function onTestingModeChange() {
    const hadResults = !distribution.hidden || !testResult.hidden;
    clearDisplayedResults();
    generateButton.textContent = testingInput.checked ? "Generate Test Assignment" : "Generate Links";
    if (hadResults) {
      showMessage(["Previous results were cleared."], "notice");
      return;
    }
    showMessage([], null);
  }

  function onGenerate() {
    const parsed = parseCouples(couplesInput.value);
    if (parsed.errors.length > 0) {
      if (testingInput.checked) {
        clearTestResult();
      }
      showMessage(parsed.errors, "error");
      return;
    }

    if (testingInput.checked) {
      runTestDraw(parsed.couples);
      return;
    }

    runLinkDraw(parsed.couples);
  }

  function runTestDraw(couples) {
    clearDistribution();

    let assignment;
    try {
      assignment = generateAssignments(couples);
    } catch (error) {
      clearTestResult();
      showMessage([errorMessage(error)], "error");
      return;
    }

    renderTestResult(couples, assignment, validateAssignments(couples, assignment));
    showMessage([], null);
    testHeading.focus();
  }

  function runLinkDraw(couples) {
    if (activeDraw) {
      const proceed = window.confirm(
        "This starts a new draw. Links already created will keep their original results and cannot be revoked. Create a new draw anyway?"
      );
      if (!proceed) {
        return;
      }
    }

    let assignment;
    try {
      assignment = generateAssignments(couples);
    } catch (error) {
      showRejectedDraw([`The assignment could not be created. No links were made. ${errorMessage(error)}`]);
      return;
    }

    const report = validateAssignments(couples, assignment);
    if (!report.valid) {
      const lines = ["The assignment was rejected, so no links were created."];
      showRejectedDraw(lines.concat(report.errors));
      return;
    }

    clearTestResult();
    activeDraw = {
      entries: buildEntries(couples, assignment),
      downloaded: false
    };
    renderDistribution(activeDraw.entries);
    showMessage([], null);
    distributionHeading.focus();
  }

  function clearDisplayedResults() {
    clearDistribution();
    clearTestResult();
    activeDraw = null;
  }

  function clearDistribution() {
    distribution.hidden = true;
    linkRows.replaceChildren();
  }

  function clearTestResult() {
    testResult.hidden = true;
    assignmentRows.replaceChildren();
    validationChecks.replaceChildren();
    validationSummary.textContent = "";
    validationSummary.className = "summary";
  }

  function renderTestResult(couples, assignment, report) {
    assignmentRows.replaceChildren();
    couples.forEach((couple) => {
      couple.members.forEach((name) => {
        const row = document.createElement("tr");
        [name, recipientAt(assignment, name, 0), recipientAt(assignment, name, 1)].forEach((value, index) => {
          const cell = document.createElement("td");
          cell.textContent = value;
          cell.setAttribute("data-label", ["Giver", "Recipient 1", "Recipient 2"][index]);
          row.appendChild(cell);
        });
        assignmentRows.appendChild(row);
      });
    });

    validationChecks.replaceChildren();
    const checks = Array.isArray(report.checks) ? report.checks : [];
    checks.forEach((check) => {
      const item = document.createElement("li");
      item.className = `check ${check.passed ? "passed" : "failed"}`;

      const disclosure = document.createElement("details");
      const summary = document.createElement("summary");

      const chevron = document.createElement("span");
      chevron.className = "chevron";
      chevron.setAttribute("aria-hidden", "true");
      chevron.textContent = "▸";

      const mark = document.createElement("span");
      mark.className = "mark";
      mark.setAttribute("aria-hidden", "true");
      mark.textContent = check.passed ? "✓" : "✕";

      const label = document.createElement("span");
      label.className = "label";
      label.textContent = check.label;

      const state = document.createElement("span");
      state.className = "state";
      state.textContent = check.passed ? "Passed" : "Failed";

      summary.append(chevron, mark, label, state);
      disclosure.appendChild(summary);

      const notes = document.createElement("ul");
      notes.className = "notes";
      const details = Array.isArray(check.details) ? check.details : [];
      details.forEach((detail) => {
        const row = noteRow(detail);
        const noteItem = document.createElement("li");
        noteItem.className = row.passed ? "pass" : "fail";

        const mini = document.createElement("span");
        mini.className = "mini";
        mini.setAttribute("aria-hidden", "true");
        mini.textContent = row.passed ? "✓" : "✗";

        const text = document.createElement("span");
        text.textContent = row.text;

        const spoken = document.createElement("span");
        spoken.className = "visually-hidden";
        spoken.textContent = row.passed ? " Passed" : " Failed";

        noteItem.append(mini, text, spoken);
        notes.appendChild(noteItem);
      });
      disclosure.appendChild(notes);
      item.appendChild(disclosure);
      validationChecks.appendChild(item);
    });

    const passedCount = checks.filter((check) => check.passed).length;
    validationSummary.textContent = `Overall: ${passedCount}/${checks.length} checks passed`;
    validationSummary.className = `summary ${report.valid ? "passed" : "failed"}`;
    testResult.hidden = false;
  }

  function noteRow(detail) {
    if (detail && typeof detail === "object") {
      return {
        passed: detail.passed === true,
        text: typeof detail.text === "string" ? detail.text : ""
      };
    }
    return { passed: false, text: typeof detail === "string" ? detail : "" };
  }

  function recipientAt(assignment, name, index) {
    if (!assignment || typeof assignment !== "object" || !Object.hasOwn(assignment, name)) {
      return "—";
    }
    const recipients = assignment[name];
    if (!Array.isArray(recipients) || typeof recipients[index] !== "string") {
      return "—";
    }
    return recipients[index];
  }

  function errorMessage(error) {
    if (error instanceof Error && error.message) {
      return error.message;
    }
    return "The assignment could not be created.";
  }

  function showRejectedDraw(lines) {
    if (activeDraw) {
      lines.push("The links already on this page are unchanged.");
    }
    showMessage(lines, "error");
  }

  function onDownload() {
    if (!activeDraw) {
      return;
    }
    downloadTextFile("secret-santa-links.csv", buildLinksCsv(activeDraw.entries));
    activeDraw.downloaded = true;
    announce("Backup downloaded. Keep that file private.");
  }

  function onBeforeUnload(event) {
    if (!activeDraw || activeDraw.downloaded) {
      return;
    }
    event.preventDefault();
    event.returnValue = "";
  }

  function showParticipant(payload) {
    greeting.textContent = `Merry Christmas, ${payload.name}!`;
    recipientList.replaceChildren();
    payload.recipients.forEach((recipient) => {
      const item = document.createElement("li");
      item.textContent = recipient;
      recipientList.appendChild(item);
    });
    showOnly(participant);
  }

  function showResultProblem(message) {
    resultErrorText.textContent = message;
    showOnly(resultError);
  }

  function showOnly(section) {
    organizer.hidden = section !== organizer;
    participant.hidden = section !== participant;
    resultError.hidden = section !== resultError;
  }

  function showMessage(lines, kind) {
    messageBox.replaceChildren();
    if (!lines || lines.length === 0) {
      messageBox.hidden = true;
      messageBox.className = "message";
      return;
    }

    messageBox.hidden = false;
    messageBox.className = `message ${kind}`;
    messageBox.setAttribute("role", kind === "error" ? "alert" : "status");

    if (lines.length === 1) {
      const paragraph = document.createElement("p");
      paragraph.textContent = lines[0];
      messageBox.appendChild(paragraph);
      return;
    }

    const list = document.createElement("ul");
    lines.forEach((line) => {
      const item = document.createElement("li");
      item.textContent = line;
      list.appendChild(item);
    });
    messageBox.appendChild(list);
  }

  function announce(message) {
    status.textContent = "";
    window.setTimeout(() => {
      status.textContent = message;
    }, 20);
  }

  function renderDistribution(entries) {
    linkRows.replaceChildren();
    entries.forEach((entry) => {
      const row = document.createElement("tr");
      const nameCell = document.createElement("td");
      nameCell.textContent = entry.name;

      const actionCell = document.createElement("td");
      const button = document.createElement("button");
      button.type = "button";
      button.className = "secondary";
      button.textContent = "Copy Link";
      button.setAttribute("aria-label", `Copy link for ${entry.name}`);
      button.addEventListener("click", () => {
        copyEntry(entry, button, actionCell);
      });
      actionCell.appendChild(button);

      row.appendChild(nameCell);
      row.appendChild(actionCell);
      linkRows.appendChild(row);
    });
    distribution.hidden = false;
  }

  async function copyEntry(entry, button, actionCell) {
    try {
      if (!navigator.clipboard || typeof navigator.clipboard.writeText !== "function") {
        throw new Error("Clipboard unavailable");
      }
      await navigator.clipboard.writeText(entry.url);
      button.textContent = "Copied";
      announce(`Link for ${entry.name} copied.`);
      window.setTimeout(() => {
        button.textContent = "Copy Link";
      }, 2000);
    } catch {
      showManualCopy(actionCell, entry);
      announce(`The link for ${entry.name} could not be copied automatically.`);
    }
  }

  function showManualCopy(actionCell, entry) {
    const row = actionCell.parentElement;
    let fallback = row.nextElementSibling;
    if (!fallback || !fallback.classList.contains("manual-copy-row")) {
      row.classList.add("has-fallback");
      fallback = document.createElement("tr");
      fallback.className = "manual-copy-row";

      const cell = document.createElement("td");
      cell.colSpan = 2;

      const hint = document.createElement("p");
      hint.className = "manual-copy";
      hint.textContent = "Clipboard isn't available. Select the link and copy it.";

      const field = document.createElement("input");
      field.type = "text";
      field.readOnly = true;
      field.value = entry.url;
      field.setAttribute("aria-label", `Result link for ${entry.name}`);

      cell.append(hint, field);
      fallback.appendChild(cell);
      row.after(fallback);
    }

    const field = fallback.querySelector("input");
    field.focus();
    field.select();
  }
});

/**
 * @param {string} text
 * @returns {{couples: Array<{id: string, members: [string, string]}>, errors: string[]}}
 */
function parseCouples(text) {
  const errors = [];
  const couples = [];
  const seenIds = new Map();
  const seenNames = new Map();
  const lines = String(text).split(/\r?\n/);

  lines.forEach((rawLine, index) => {
    const line = rawLine.trim();
    if (line === "") {
      return;
    }

    const lineNumber = index + 1;
    const parts = line.split(",").map((part) => part.trim());
    if (parts.length !== 3 || parts.some((part) => part === "")) {
      errors.push(`Line ${lineNumber} must contain a couple id and two names, separated by commas.`);
      return;
    }

    const [id, first, second] = parts;
    const idKey = id.toLocaleLowerCase();
    const previousId = seenIds.get(idKey);
    if (previousId && previousId === id) {
      errors.push(`The couple id "${id}" is used more than once.`);
    } else if (previousId) {
      errors.push(`The couple ids "${previousId}" and "${id}" match aside from capitalization.`);
    } else {
      seenIds.set(idKey, id);
    }

    rememberName(first, seenNames, errors);
    rememberName(second, seenNames, errors);
    couples.push({ id, members: [first, second] });
  });

  if (couples.length !== 4) {
    errors.unshift(`Enter exactly four couples. Found ${couples.length}.`);
  }

  return { couples, errors };
}

function rememberName(name, seenNames, errors) {
  const key = name.toLocaleLowerCase();
  const previous = seenNames.get(key);
  if (!previous) {
    seenNames.set(key, name);
    return;
  }
  if (previous === name) {
    errors.push(`The name "${name}" appears more than once.`);
    return;
  }
  errors.push(`The names "${previous}" and "${name}" match aside from capitalization.`);
}

function buildEntries(couples, assignment) {
  const entries = [];
  couples.forEach((couple) => {
    couple.members.forEach((name) => {
      const recipients = assignment[name].map((recipient) => String(recipient));
      entries.push({
        name,
        url: buildResultUrl({
          version: RESULT_VERSION,
          name,
          recipients
        })
      });
    });
  });
  return entries;
}

function buildResultUrl(payload) {
  const url = new URL(window.location.href);
  url.search = "";
  url.hash = `result=${encodeBase64UrlUtf8(JSON.stringify(payload))}`;
  if (url.pathname.endsWith("/index.html")) {
    url.pathname = url.pathname.slice(0, -"index.html".length);
  }
  return url.href;
}

function buildLinksCsv(entries) {
  const lines = ["participant,link"];
  entries.forEach((entry) => {
    lines.push(`${csvField(entry.name)},${csvField(entry.url)}`);
  });
  return `\uFEFF${lines.join("\n")}\n`;
}

function csvField(value) {
  const text = String(value);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function downloadTextFile(filename, contents) {
  const blob = new Blob([contents], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function readResultToken(hash) {
  if (!hash.startsWith(RESULT_HASH_PREFIX)) {
    return null;
  }
  const raw = hash.slice(RESULT_HASH_PREFIX.length);
  if (raw === "") {
    return "";
  }
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

function decodeResultPayload(token) {
  if (!token) {
    failResult("MALFORMED");
  }

  let json;
  try {
    json = decodeBase64UrlUtf8(token);
  } catch {
    failResult("MALFORMED");
  }

  let payload;
  try {
    payload = JSON.parse(json);
  } catch {
    failResult("MALFORMED");
  }

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    failResult("MALFORMED");
  }
  if (payload.version !== RESULT_VERSION) {
    failResult("VERSION");
  }
  if (typeof payload.name !== "string" || payload.name.trim() === "") {
    failResult("MALFORMED");
  }
  if (!Array.isArray(payload.recipients) || payload.recipients.length !== 2) {
    failResult("MALFORMED");
  }

  const recipients = payload.recipients.map((recipient) => {
    if (typeof recipient !== "string" || recipient.trim() === "") {
      failResult("MALFORMED");
    }
    return recipient.trim();
  });

  return {
    version: RESULT_VERSION,
    name: payload.name.trim(),
    recipients
  };
}

function failResult(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

function resultProblemMessage(error) {
  if (error && error.code === "VERSION") {
    return "This link uses a result format this page does not understand.";
  }
  return "This link is missing a result, or the result is damaged. Ask the organizer for a new link.";
}

function encodeBase64UrlUtf8(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeBase64UrlUtf8(encoded) {
  if (typeof encoded !== "string" || !/^[A-Za-z0-9_-]*$/.test(encoded)) {
    throw new Error("Invalid encoding");
  }
  const padded = encoded + "=".repeat((4 - (encoded.length % 4)) % 4);
  const binary = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}
