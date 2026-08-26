# Mobile Board Layout

The player interface always displays the complete 15 × 15 board inside the
available smartphone width.

## No Gameplay Zoom

The player board does not use zoom or pan while preparing a move. Every board
coordinate remains visible at all times.

To place a tile:

1. select a tile from the private rack;
2. tap its destination square on the board;
3. repeat for the remaining tiles;
4. submit the move.

The coordinate form remains available as an alternative input method when a
precise touch target is inconvenient on a very small display.

## Responsive Sizing

The board cell size is calculated from the actual viewport width. The board is
then centered inside its square viewport.

The page itself never needs horizontal scrolling for gameplay.

## Rack Proximity

On portrait smartphones the private rack is placed immediately above the
board so the player can select and place tiles without repeatedly scrolling
between distant sections.

## Server Independence

Board sizing and rack ordering are local presentation state only. They are
never sent to the authoritative game server and cannot change the game rules.
