/**
 * Electronic Scrabble player board layout contract tests.
 *
 * Guards the smartphone player interface against reintroducing gameplay zoom
 * or horizontal board panning.
 *
 * @author Electronic Scrabble Project
 * @version 0.2.0
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

test('player board exposes no gameplay zoom controls', () => {
    assert.doesNotMatch(playerHtml, /id="board-zoom-out"/);
    assert.doesNotMatch(playerHtml, /id="board-zoom-in"/);
    assert.doesNotMatch(playerHtml, /id="board-fit"/);
    assert.doesNotMatch(playerHtml, /id="board-zoom-status"/);
});

test('player client contains no zoom or pan state', () => {
    assert.doesNotMatch(playerHtml, /BOARD_ZOOM_MULTIPLIERS/);
    assert.doesNotMatch(playerHtml, /boardZoomIndex/);
    assert.doesNotMatch(playerHtml, /boardPanX/);
    assert.doesNotMatch(playerHtml, /focusBoardCell/);
});

test('complete board is centered in the fixed player viewport', () => {
    assert.match(
        playerCss,
        /#player-board\s*\{[^}]*top:\s*50%;[^}]*left:\s*50%;[^}]*transform:\s*translate\(-50%, -50%\);/s
    );
});

test('player interaction assets are versioned to invalidate browser cache', () => {
    assert.match(playerHtml, /\.\/css\/player\.css\?v=17\.0\.0/);
    assert.match(playerHtml, /\.\/js\/rack-order\.js\?v=17\.0\.0/);
    assert.match(playerHtml, /\.\/js\/board-navigation\.js\?v=17\.0\.0/);
});
