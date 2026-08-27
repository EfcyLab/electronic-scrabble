# Move Challenges

Electronic Scrabble supports two word-validation policies.

## Automatic Validation

This remains the default policy.

```bash
export ELECTRONIC_SCRABBLE_WORD_VALIDATION_POLICY=automatic
```

When a dictionary is enabled, every word formed by a submitted move is checked
before the move is applied. Any invalid word rejects the move immediately.

## Challenge Validation

Challenge mode reproduces the classic-game interaction more closely.

```bash
export ELECTRONIC_SCRABBLE_DICTIONARY_MODE=required
export ELECTRONIC_SCRABBLE_DICTIONARY_PATH=./dictionary/authorized-words.txt
export ELECTRONIC_SCRABBLE_DICTIONARY_NAME="Authorized French dictionary"
export ELECTRONIC_SCRABBLE_WORD_VALIDATION_POLICY=challenge
```

Challenge mode requires an enabled dictionary. The server refuses to start if
challenge mode is selected without one.

The workflow is:

1. The current player submits a structurally valid move.
2. The move is displayed provisionally on the board.
3. The moving player's used tiles are temporarily removed from the private rack.
4. The next player can accept the move without checking it.
5. Any opponent can challenge the move before acceptance.
6. If a challenge finds at least one invalid formed word, the complete move is
   rolled back and the moving player loses the turn.
7. If every challenged word is valid, the move is committed normally.
8. Only after commitment are points awarded and replacement tiles drawn.

An unchallenged move is intentionally accepted without dictionary lookup in
challenge mode. This allows an invalid word to remain on the board when nobody
challenges it, matching classic Scrabble challenge semantics.

## Privacy

The public pending-move state contains only:

- Player identifier and display name
- Proposed score
- Formed words
- Public board coordinates
- Next player identifier

It never contains private rack snapshots or tile identifiers.

## Unsuccessful Challenge Penalty

Milestone 13 intentionally applies no point penalty for an unsuccessful
challenge.

The currently published FISF classic overview confirms the challenge timing and
invalid-word rollback behavior. An older international regulation specifies a
five-point penalty per wrongly challenged word, but the current 2026 competition
PDF could not be independently read during implementation. The penalty therefore
remains unimplemented until the current text is verified.

## FFSc Online Challenge Provider

When no licensed local ODS word list is available, challenge mode can use the
FFSc online checker:

```bash
export ELECTRONIC_SCRABBLE_DICTIONARY_MODE=ffsc
export ELECTRONIC_SCRABBLE_DICTIONARY_NAME="FFSc ODS 9 online"
export ELECTRONIC_SCRABBLE_WORD_VALIDATION_POLICY=challenge
```

Internet or provider failures return `WORD_CHECK_UNAVAILABLE` and leave the
pending move unresolved rather than treating the word as invalid.

## Unsuccessful Challenge Penalty

The current FFSc online checker response states that a player who unsuccessfully
challenges a valid word receives a 5-point penalty. Electronic Scrabble applies
that penalty when a challenge resolves with every challenged word valid.
