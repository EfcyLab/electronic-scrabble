# Internationalization

Electronic Scrabble uses client-side resource bundles so each device can select its own interface language independently.

## Principles

- English is the canonical source language.
- Game rules and protocol values remain language-independent.
- Each browser stores its selected language locally.
- The language is never stored in the authoritative game state.
- A shared screen, administrator, and each player may use different languages simultaneously.
- Internal premium-square codes remain `DL`, `TL`, `DW`, and `TW`.
- Display labels are translated by the resource bundle. French uses `LD`, `LT`, `MD`, and `MT`.

## Resource Structure

```text
shared/
├── i18n/
│   ├── en.js
│   └── fr.js
└── js/
    └── i18n-manager.js
```

Every resource bundle must expose the same keys.

## Adding a Language

1. Copy `shared/i18n/en.js` to a new locale file.
2. Translate every resource value without changing its key.
3. Register the locale under its ISO language code.
4. Add the language to each language selector.
5. Extend the automated resource parity test.

Application code must never use a translated value as a game rule or protocol identifier.

## Dynamic Messages

Server errors continue to use stable language-independent error codes such as:

```text
NOT_YOUR_TURN
INVALID_WORD
FIRST_MOVE_MUST_COVER_CENTER
```

The client translates those codes locally. The English server message remains a fallback when no resource exists.
