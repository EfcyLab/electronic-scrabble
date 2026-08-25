/**
 * French Scrabble tile bag tests.
 *
 * Verifies the tile count, distribution integrity, unique tile identifiers,
 * and rack drawing behavior.
 *
 * @author Electronic Scrabble Project
 * @version 0.3.0
 */

const assert = require('node:assert/strict');
const test = require('node:test');
const {
    FRENCH_TILE_DISTRIBUTION,
    RACK_SIZE,
    TOTAL_TILES,
    createFrenchTileBag,
    drawTiles
} = require('../game/french-tiles');

test('French tile distribution contains 102 tiles', () => {
    const count = FRENCH_TILE_DISTRIBUTION.reduce(
        (total, definition) => total + definition.count,
        0
    );

    assert.equal(count, TOTAL_TILES);
});

test('French tile bag contains unique tile identifiers', () => {
    const bag = createFrenchTileBag();
    const identifiers = new Set(bag.map((tile) => tile.id));

    assert.equal(bag.length, TOTAL_TILES);
    assert.equal(identifiers.size, TOTAL_TILES);
});

test('French tile bag contains two blank tiles', () => {
    const bag = createFrenchTileBag();
    const blankTiles = bag.filter((tile) => tile.isBlank);

    assert.equal(blankTiles.length, 2);

    blankTiles.forEach((tile) => {
        assert.equal(tile.letter, null);
        assert.equal(tile.value, 0);
    });
});

test('Drawing a rack removes seven tiles from the bag', () => {
    const bag = createFrenchTileBag();
    const rack = drawTiles(bag, RACK_SIZE);

    assert.equal(rack.length, RACK_SIZE);
    assert.equal(bag.length, TOTAL_TILES - RACK_SIZE);
});
