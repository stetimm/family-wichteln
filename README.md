# Secret Santa

A one-page Christmas gift draw for eight people (four couples). One organizer creates the draw in the browser and sends each person a private link. There is no account, server, or database.

**Generate Links** draws the whole exchange at once and creates one private link per person. **Testing Mode** shows that draw and a validation report on this page, and it does not create links.

## Use the page

1. Open the published site. That is the organizer view.
2. Check the four couples. Each line is `couple id, first name, second name`.
3. Choose **Generate Links**.
4. Copy each person's link, or choose **Download Links** and keep that file.
5. Send each person only their own link.
6. A participant opens the link and sees the two people they are buying for.

The organizer view lists names and copy buttons only. It does not show recipients.

Leave the tab open until the backup file is saved. The eight links are kept in memory for that visit and are not stored in the browser. Generating again asks for confirmation, because older links keep their original results and cannot be revoked.

A result link uses the page address plus a `#result=` fragment. The fragment is not sent to the host. It is Base64URL text, not encryption: anyone who has a link can read that one result. A link never contains the full draw.

## Publish with GitHub Pages

1. Create a GitHub repository.
2. Add `index.html`, `style.css`, `app.js`, `assignment.js`, and this README.
3. In the repository settings, open **Pages**.
4. Deploy from the `main` branch and the root folder.
5. Open the HTTPS address GitHub gives you, such as `https://USERNAME.github.io/REPOSITORY/`.

Result links are built from the address of the page you have open, so the same files work at a repository subpath and at a domain root. Open the site over HTTPS once it is published. `http://localhost` is fine for a local check.

To try it locally, from this folder:

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080/`.

## Assignment algorithm

`assignment.js` chooses one complete assignment at random. Each person is given one of 12 allowed recipient pairs, all equally likely, and the whole result is kept only when `validateAssignments` accepts it. That rejection sampling gives every valid assignment the same chance. Do not replace it with a greedy draw or with backtracking that stops at the first success.

A kept draw has these properties:

1. Every participant gives exactly two gifts.
2. Every participant receives exactly two gifts.
3. Nobody is assigned themselves.
4. Nobody is assigned their partner.
5. The two recipients of any participant belong to two different couples.
6. No giver is assigned the same person twice.

The page runs that same validator again before it builds links. A result that fails is discarded. Testing Mode uses the same generator and the same validator, then shows the eight rows and the individual checks.

## Files

- `index.html` — page structure
- `style.css` — layout
- `app.js` — both screens, name checks, and link encoding
- `assignment.js` — the draw and its validation
- `README.md` — this guide
