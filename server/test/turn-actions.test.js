/**
 * Electronic Scrabble turn action tests.
 *
 * Verifies tile exchange eligibility, rack ownership, draw-before-return
 * behavior, and rack/bag size preservation.
 *
 * @author Electronic Scrabble Project
 * @version 0.6.0
 */

const assert = require('node:assert/strict');
const test = require('node:test');
const {
    MIN_EXCHANGE_BAG_SIZE,
    TurnActionError,
    exchangeTiles,
    validateExchangeSelection
} = require('../game/turn-actions');

/**
 * Creates a deterministic tile for turn-action tests.
 *
 * @param {string} id Tile identifier.
 * @param {string} letter Tile letter.
 *
 * @returns {Object} Test tile.
 */
function tile(id, letter) {
    return {
        id,
        letter,
        value: 1,
        isBlank: false
    };
}

/**
 * Creates a deterministic bag with the requested number of tiles.
 *
 * @param {number} count Number of test tiles.
 *
 * @returns {Array<Object>} Test bag.
 */
function bag(count) {
    return Array.from({ length: count }, (_, index) => (
        tile(`BAG-${index}`, String.fromCharCode(65 + (index % 26)))
    ));
}

test('exchange is refused when fewer than seven tiles remain in the bag', () => {
    const rack = [tile('R1', 'A')];

    assert.throws(
        () => validateExchangeSelection(
            rack,
            ['R1'],
            MIN_EXCHANGE_BAG_SIZE - 1
        ),
        (error) => (
            error instanceof TurnActionError &&
            error.code === 'NOT_ENOUGH_TILES_TO_EXCHANGE'
        )
    );
});

test('exchange requires at least one selected tile', () => {
    const rack = [tile('R1', 'A')];

    assert.throws(
        () => validateExchangeSelection(rack, [], MIN_EXCHANGE_BAG_SIZE),
        (error) => error.code === 'EMPTY_EXCHANGE'
    );
});

test('exchange rejects a tile that does not belong to the rack', () => {
    const rack = [tile('R1', 'A')];

    assert.throws(
        () => validateExchangeSelection(
            rack,
            ['UNKNOWN'],
            MIN_EXCHANGE_BAG_SIZE
        ),
        (error) => error.code === 'TILE_NOT_IN_RACK'
    );
});

test('exchange rejects duplicate tile identifiers', () => {
    const rack = [tile('R1', 'A'), tile('R2', 'B')];

    assert.throws(
        () => validateExchangeSelection(
            rack,
            ['R1', 'R1'],
            MIN_EXCHANGE_BAG_SIZE
        ),
        (error) => error.code === 'DUPLICATE_EXCHANGE_TILE'
    );
});

test('exchange preserves rack and bag sizes', () => {
    const currentBag = bag(20);
    const rack = [
        tile('R1', 'A'),
        tile('R2', 'B'),
        tile('R3', 'C'),
        tile('R4', 'D'),
        tile('R5', 'E'),
        tile('R6', 'F'),
        tile('R7', 'G')
    ];

    const result = exchangeTiles(currentBag, rack, ['R2', 'R5', 'R7']);

    assert.equal(result.exchangedCount, 3);
    assert.equal(result.rack.length, 7);
    assert.equal(currentBag.length, 20);
});

test('discarded tiles cannot be drawn as immediate replacements', () => {
    const currentBag = bag(7);
    const rack = [
        tile('R1', 'A'),
        tile('R2', 'B'),
        tile('R3', 'C')
    ];

    const result = exchangeTiles(currentBag, rack, ['R1', 'R2']);
    const replacementIds = new Set(
        result.replacementTiles.map((replacement) => replacement.id)
    );

    assert.equal(replacementIds.has('R1'), false);
    assert.equal(replacementIds.has('R2'), false);
    assert.equal(currentBag.some((bagTile) => bagTile.id === 'R1'), true);
    assert.equal(currentBag.some((bagTile) => bagTile.id === 'R2'), true);
});
