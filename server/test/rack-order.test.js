/**
 * Electronic Scrabble rack ordering tests.
 *
 * Verifies that local rack arrangement preserves existing tile order,
 * appends newly drawn tiles, supports explicit movement, and never mutates
 * the authoritative rack array supplied by the server.
 *
 * @author Electronic Scrabble Project
 * @version 0.8.0
 */

const assert = require('node:assert/strict');
const test = require('node:test');
const {
    moveRackTile,
    moveRackTileByOffset,
    orderRackByIds,
    reconcileRackOrder,
    shuffleRack
} = require('../../player/js/rack-order');

/**
 * Creates a deterministic private rack tile for ordering tests.
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
 * Returns tile identifiers from a rack.
 *
 * @param {Array<Object>} rack Rack tiles.
 *
 * @returns {Array<string>} Tile identifiers.
 */
function ids(rack) {
    return rack.map((rackTile) => rackTile.id);
}

test('stored rack order is restored for existing tiles', () => {
    const rack = [
        tile('A', 'A'),
        tile('B', 'B'),
        tile('C', 'C')
    ];

    assert.deepEqual(
        ids(reconcileRackOrder(rack, ['C', 'A', 'B'])),
        ['C', 'A', 'B']
    );
});

test('newly drawn tiles are appended after preserved tiles', () => {
    const rack = [
        tile('A', 'A'),
        tile('C', 'C'),
        tile('D', 'D')
    ];

    assert.deepEqual(
        ids(reconcileRackOrder(rack, ['C', 'B', 'A'])),
        ['C', 'A', 'D']
    );
});

test('moving a tile uses a copy and keeps the server rack untouched', () => {
    const rack = [
        tile('A', 'A'),
        tile('B', 'B'),
        tile('C', 'C')
    ];

    const reorderedRack = moveRackTile(rack, 'A', 2);

    assert.deepEqual(ids(reorderedRack), ['B', 'C', 'A']);
    assert.deepEqual(ids(rack), ['A', 'B', 'C']);
});

test('relative movement clamps at rack boundaries', () => {
    const rack = [
        tile('A', 'A'),
        tile('B', 'B'),
        tile('C', 'C')
    ];

    assert.deepEqual(
        ids(moveRackTileByOffset(rack, 'A', -1)),
        ['A', 'B', 'C']
    );

    assert.deepEqual(
        ids(moveRackTileByOffset(rack, 'C', 1)),
        ['A', 'B', 'C']
    );
});

test('rack can be rebuilt from DOM-style tile identifier order', () => {
    const rack = [
        tile('A', 'A'),
        tile('B', 'B'),
        tile('C', 'C')
    ];

    assert.deepEqual(
        ids(orderRackByIds(rack, ['B', 'C', 'A'])),
        ['B', 'C', 'A']
    );
});

test('shuffle returns a deterministic reordered copy with injected randomness', () => {
    const rack = [
        tile('A', 'A'),
        tile('B', 'B'),
        tile('C', 'C'),
        tile('D', 'D')
    ];
    const values = [0, 0, 0];
    let index = 0;

    const shuffledRack = shuffleRack(rack, () => values[index++]);

    assert.deepEqual(ids(shuffledRack), ['B', 'C', 'D', 'A']);
    assert.deepEqual(ids(rack), ['A', 'B', 'C', 'D']);
});
