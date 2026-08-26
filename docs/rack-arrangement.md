# Rack Arrangement

## Purpose

A player may rearrange the tiles displayed on their private rack to make
anagrams and word patterns easier to identify, just as they would rearrange
physical tiles on a real rack.

Rack order is a local presentation preference. It is not part of the game
state and is never sent to the authoritative server.

## Supported Interactions

The player interface supports:

- pointer drag-and-drop with a mouse, stylus, or touch screen, using sibling midpoint calculations for reliable mobile reordering;
- **Move Left** and **Move Right** controls for the selected tile;
- **Shuffle Rack** for a random local ordering;
- local persistence across page reloads.

## Persistence

The browser stores only the ordered private tile identifiers for the current
player and game. When the server later sends an updated rack:

1. tiles still present keep their locally selected order;
2. tiles no longer present are discarded from the stored order;
3. newly drawn tiles are appended to the end of the rack.

No rack order information is broadcast to the shared screen, administrator,
or other players.

## Interaction With Moves

Rack rearrangement is disabled while:

- one or more tiles are provisionally placed on the board;
- tile exchange selection mode is active;
- the game is finished.

A player may rearrange their rack while waiting for another player's turn.
