/**
 * Electronic Scrabble internationalization tests.
 *
 * Verifies resource-bundle completeness and board terminology translations.
 *
 * @author Electronic Scrabble Project
 * @version 1.0.0
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const english = require(path.resolve(__dirname, '../../shared/i18n/en.js'));
const french = require(path.resolve(__dirname, '../../shared/i18n/fr.js'));
const BoardNavigation = require(path.resolve(
    __dirname,
    '../../player/js/board-navigation.js'
));

test('English and French resource bundles expose the same keys', () => {
    assert.deepEqual(
        Object.keys(french).sort(),
        Object.keys(english).sort()
    );
});

test('French premium-square abbreviations are localized', () => {
    assert.equal(french['premium.DL.short'], 'LD');
    assert.equal(french['premium.TL.short'], 'LT');
    assert.equal(french['premium.DW.short'], 'MD');
    assert.equal(french['premium.TW.short'], 'MT');
});

test('English remains the canonical premium-square terminology', () => {
    assert.equal(english['premium.DL.short'], 'DL');
    assert.equal(english['premium.TL.short'], 'TL');
    assert.equal(english['premium.DW.short'], 'DW');
    assert.equal(english['premium.TW.short'], 'TW');
});

test('mobile board fit calculation keeps the full board inside the viewport', () => {
    const cellSize = BoardNavigation.calculateFitCellSize(360, 15, 2, 6);
    const boardSize = BoardNavigation.calculateBoardSize(cellSize, 15, 2, 6);

    assert.ok(boardSize <= 360.000001);
});

test('mobile board pan is clamped to the viewport edges', () => {
    assert.deepEqual(
        BoardNavigation.clampPan(-900, 400, 600, 360, 360),
        { x: -240, y: 0 }
    );
});

test('mobile board can calculate a centered coordinate', () => {
    const pan = BoardNavigation.calculateCenteredPan(7, 7, 40, 360, 360, 2, 6);

    assert.equal(Number.isFinite(pan.x), true);
    assert.equal(Number.isFinite(pan.y), true);
});
