# Mobile Player Navigation

The player interface uses a compact portrait workspace designed to keep the rack and board close together without horizontal page scrolling.

## Rack Layout

All seven rack slots are sized from the available container width. The interface reduces or removes inter-tile gaps on narrow devices so the complete rack remains visible in portrait orientation.

Rack order remains local to the player's browser and does not affect the authoritative game state.

## Compact Gameplay Workspace

The rack and board are visually connected on narrow screens. Secondary explanatory text is reduced while accessible labels remain available to assistive technologies.

The rack arrangement controls appear beside the rack title on mobile. The board itself is the first visible element in the move section, directly beneath the rack.

## Overview Mode

The complete 15 × 15 board fits inside the available phone width. This mode provides context for the full game.

## Precision Mode

Selecting a rack tile from overview mode automatically switches to precision mode. The viewport centers on the centroid of already played tiles, or on the center square when the board is empty.

Tapping a board square without a selected rack tile also enters precision mode and centers that square.

When zoomed, the board can be panned with touch, mouse, or stylus input.

## Controls

The player interface provides explicit controls for:

- zoom out;
- fit the complete board;
- zoom in.

These controls remain available as an alternative to touch panning.

## Page Scrolling

The player page disables horizontal page overflow. Board navigation remains contained inside the square board viewport.

Vertical spacing between the rack and board is minimized so the two primary gameplay elements remain visually adjacent on portrait phones.

## Game Independence

Rack sizing, zoom, pan, and compact-layout values are local UI state. They are never sent to the game server and cannot affect gameplay.
