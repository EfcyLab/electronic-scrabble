# End-Game Rules

## Version 0.7.0

Electronic Scrabble currently implements the classic francophone end-game
conditions described by the FISF.

## Rack Emptied

The game ends immediately when:

- the tile bag is empty; and
- the player who just completed a move has no tiles left after replenishment.

Final scoring:

- every other player subtracts the face value of their remaining rack;
- the finishing player receives the combined value of all other remaining racks.

Blank tiles have a value of zero.

## Blocked Game

The game also ends when:

- fewer than seven tiles remain in the bag, so an exchange is unavailable; and
- every player has passed three consecutive turns.

For two players, this means six uninterrupted pass actions. For three players,
nine; for four players, twelve.

Any accepted move or tile exchange resets the uninterrupted pass counter.

Final scoring in a blocked game:

- each player subtracts the face value of their own remaining rack;
- no player receives the other players' rack values.

## Privacy

The final public result contains only:

- remaining rack point values;
- score adjustments;
- final scores;
- ranking information.

Remaining letters and private tile identifiers are never exposed publicly.

## Verified Sources

- FISF, “Formules de jeu – Classique”: https://fisf.net/scrabble/decouverte/formules-de-jeu-classique/
- FISF, International Classic Rules 2020, sections 4.2 and 7: https://classement.fisf.net/documents/FISF_ReglementInternationalClassique2020.pdf
