# Note for future development

## What was done

Participants can see who else is buying for each of their two recipients.

The eight Secret Santa links had already been sent. Those links stay valid and were not replaced. Each link is still the page address plus a `#result=` fragment. The fragment is Base64URL of version 1 JSON: the participant's name and their two recipients, in that order. It does not name the other giver.

Because the links could not change, the other giver is delivered beside them:

1. The organizer pastes the eight original links on the organizer page.
2. **Import & Validate** rebuilds that draw and runs the existing `validateAssignments` checks. It does not call `generateAssignments` and it does not draw again.
3. **Generate Encrypted Coordination File** downloads `coordination.json` (version 1).
4. That file is committed to the repository root and published with GitHub Pages.

The file holds eight encrypted entries and no names. When someone opens an existing link, the page shows their two recipients immediately, then fetches `coordination.json` from the same directory. It derives an AES-256-GCM key and a lookup id from a fixed label, the participant's name, and the two recipients in link order. Decryption reveals only the other giver for each of those two people.

If the file is missing, damaged, or cannot be opened, the two recipients still show, with the note "Gift coordination information is not available yet."

`coordination.js` holds the crypto. `assignment.js` and the version 1 link encoding are unchanged.

## Why this shape

This is a hotfix for one draw whose links were already distributed.

A new link would have been simpler, but every participant would have needed a replacement, and the links already in use would have been the wrong artifact. The extra organizer step exists only so those eight links can gain the co-giver detail without being reissued.

The encryption is a privacy screen for the published file. The key is derived from information already inside the participant's own link, and the set of valid assignments is small. It stops casual reading of `coordination.json`. It is not strong secrecy.

## Next branch

Cut a branch for the next draw, when new links can be issued. Suggested name: `cogiver-in-link`.

On that branch, **Generate Links** should put the other giver in the result payload. The participant page should read it from the fragment. There should be no import step, no `coordination.json`, and no second publish.

Do that only for newly generated links. Keep reading version 1 links as they are today, so the links already sent keep working for as long as this draw needs them.

A version 2 payload can stay as plain Base64URL, same as version 1. The fragment is already private to the person who holds the link. Suggested shape, with recipient order preserved:

```json
{
  "version": 2,
  "name": "Participant",
  "recipients": ["Recipient A", "Recipient B"],
  "coGivers": {
    "Recipient A": "Other giver",
    "Recipient B": "Other giver"
  }
}
```

Build `coGivers` from the assignment that was just drawn, after `validateAssignments` accepts it. Each recipient must have exactly two distinct givers, and the value stored for a recipient is the giver who is not the participant.

The participant page should show the same closed section under each recipient. For version 2, fill it from `coGivers` and do not fetch `coordination.json`. For version 1, keep the current fetch and decrypt path until those links are retired.

Leave the rejection sampling and the assignment rules alone. When this draw is finished and nobody still needs the original links, the import UI, `coordination.js`, and `coordination.json` can be removed.
