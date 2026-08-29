# Mobile Board Layout

The player interface always displays the complete 15 × 15 board inside the
available smartphone width.

## No Gameplay Zoom

The player board does not use zoom or pan while preparing a move. Every board
coordinate remains visible at all times.

To place a tile:

1. drag a tile from the private rack onto its destination square, or select it
   and tap the destination square;
2. reposition provisional tiles directly on the board when needed;
3. compare the live provisional move score calculated in the browser;
4. submit the move.

Coordinate-form placement has been removed to keep the gameplay surface simple.

## Responsive Sizing

The board cell size is calculated from the actual viewport width. The board is
then centered inside its square viewport.

The page itself never needs horizontal scrolling for gameplay.

## Rack Proximity

The private rack is placed immediately below the board. The board and rack use
a joined visual surface with no intermediate controls, which minimizes vertical
scrolling on portrait phones.

Tile exchange controls are integrated into the rack section instead of living
in a separate turn-management card.

## Live Score Preview

After each provisional placement change, the player recalculates the structural
score locally. The browser preview module mirrors the authoritative server move
engine and is covered by parity tests against it, including premium squares,
cross-words, blanks, and the seven-tile bonus. No WebSocket preview request is
required. Dictionary validation remains part of the normal submit or challenge
workflow.

## Server Independence

Board sizing, rack ordering, and move-score preview are local presentation state only. Final move validation and authoritative game state remain server-side.


## Blank Tiles

The rack no longer contains a permanent blank-letter selector. When a blank is
placed by tap or drag, the player is asked for the represented A-Z letter at
that moment. Cancelling the prompt leaves the blank on the rack.
