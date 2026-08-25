# Mobile Board Navigation

The player interface uses a dedicated board viewport instead of horizontal page scrolling.

## Overview Mode

The complete 15 × 15 board fits inside the available phone width. This mode provides context for the full game.

## Focus Mode

Tapping a board square without a selected rack tile zooms into that area. When a selected tile is placed from overview mode, the viewport automatically zooms and centers the placement.

When zoomed, the board can be panned with touch, mouse, or stylus input.

## Controls

The player interface provides explicit controls for:

- zoom out;
- fit the complete board;
- zoom in.

These controls remain available as an alternative to touch panning.

## Page Scrolling

The player page disables horizontal page overflow. Board navigation remains contained inside the square board viewport.

## Game Independence

Zoom and pan values are local UI state. They are never sent to the game server and cannot affect gameplay.
