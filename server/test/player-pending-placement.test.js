/**
 * Electronic Scrabble provisional board-placement client contract tests.
 *
 * @author Electronic Scrabble Project
 * @version 1.0.0
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const playerHtml = fs.readFileSync(
    path.resolve(__dirname, '../../player/index.html'),
    'utf8'
);
const playerCss = fs.readFileSync(
    path.resolve(__dirname, '../../player/css/player.css'),
    'utf8'
);

test('provisional board tiles can be selected and relocated locally', () => {
    assert.match(playerHtml, /function selectPendingPlacement\(/);
    assert.match(playerHtml, /function movePendingPlacement\(/);
    assert.match(playerHtml, /selectedPendingPlacementKey/);
    assert.match(playerHtml, /pendingPlacements\.delete\(selectedPendingPlacementKey\)/);
    assert.match(playerHtml, /pendingPlacements\.set\(destinationKey/);
});

test('provisional tile relocation has a visible selected state', () => {
    assert.match(playerHtml, /player-board-cell--pending-selected/);
    assert.match(playerCss, /\.player-board-cell--pending-selected/);
});

test('coordinate controls can move a provisional tile as an accessible alternative', () => {
    assert.match(
        playerHtml,
        /selectedPendingPlacementKey !== null[\s\S]*movePendingPlacement\(row, column\)/
    );
});
