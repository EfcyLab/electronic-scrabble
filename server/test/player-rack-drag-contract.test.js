/**
 * Electronic Scrabble player rack drag contract tests.
 *
 * Verifies that touch rearrangement uses pointer capture safely and computes
 * insertion positions without document.elementFromPoint().
 *
 * @author Electronic Scrabble Project
 * @version 0.1.0
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

test('rack tiles reserve pointer gestures for local rearrangement', () => {
    assert.match(
        playerCss,
        /\.rack-tile\s*\{[^}]*touch-action:\s*none;/s
    );
});

test('rack drag calculates insertion from sibling midpoints', () => {
    assert.match(playerHtml, /RackOrder\.getRackInsertionIndex/);
    assert.match(playerHtml, /getBoundingClientRect\(\)/);
    assert.doesNotMatch(playerHtml, /document\.elementFromPoint/);
});

test('rack drag listeners include pointer cancellation recovery', () => {
    assert.match(playerHtml, /addEventListener\('pointerdown'/);
    assert.match(playerHtml, /addEventListener\('pointermove'/);
    assert.match(playerHtml, /addEventListener\('pointerup'/);
    assert.match(playerHtml, /addEventListener\('pointercancel'/);
});
