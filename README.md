# arthurito

A standalone Pi / Gentle Shell extension that replaces the entire startup header (rose, logo, and header stats) with `arthur.txt`. The rest of the interface is unchanged.

## Activation

Gentle Shell must load Arthur **instead of** its native startup banner. Passing `-e arthur.ts` alone is not sufficient: the launcher can also inject its native banner, which overwrites Arthur later.

`settings.example.json` contains the two package entries needed for this machine. Merge those entries into the existing `packages` array in `/Users/douglas/.gentle-shell/agent/settings.json`, preserving all other packages and settings:

```json
{
  "source": "/opt/homebrew/lib/node_modules/gentle-pi",
  "extensions": ["!extensions/startup-banner.ts"]
}
```

```json
"/Users/douglas/Developer/arthurito"
```

If a Gentle Pi package entry already exists, update that entry rather than registering a second copy. The explicit Gentle Pi declaration tells the launcher not to inject an unfiltered copy. Its package filter disables only `startup-banner.ts`; all its other extensions, skills, prompts, and themes remain available.

Restart with:

```bash
gentle-shell
```

These are local package references: keep this repository in place. Adjust both paths if either package moves. No installation source files need modification. The example contains only the package entries for this customization: never use it to overwrite your whole settings file.

## Behavior

- Reads `arthur.txt` relative to the extension, not the current directory.
- Registers the header during `session_start`, without takeover timers or retries.
- Uses the active Pi theme's `accent` color, evaluated on each render.
- Preserves Braille whitespace and centers the drawing; crops it on narrow terminals.
- Does nothing in RPC, JSON, or print mode.
- Other extensions replacing the header can still conflict; only one header slot exists.

## Verification

```bash
node --test
```

Tests require the existing host packages under `/opt/homebrew/lib/node_modules/gentle-pi`. They cover rendering, lifecycle, and the **real Pi package resolver**: the proposed settings disable the native banner, enable Arthur, and retain every other host extension. They also check that the real launcher recognizes the package declaration. These checks do not replace visual confirmation in a terminal.

## Undo

Remove the Arthur package entry and remove the native banner exclusion from the Gentle Pi entry, then restart. Do not delete unrelated packages or settings.
