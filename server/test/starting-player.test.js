/**
 * Starting-player draw tests.
 *
 * @author Electronic Scrabble Project
 * @version 1.0.0
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const {
    determineStartingPlayer,
    rotateTurnOrder
} = require('../game/starting-player');

/**
 * Creates a test tile.
 *
 * @param {string} id Tile ID.
 * @param {string|null} letter Tile letter or null for a blank.
 *
 * @returns {Object} Test tile.
 */
function createTile(id, letter) {
    return {
        id,
        letter,
        value: letter === null ? 0 : 1,
        isBlank: letter === null
    };
}

const players = [
    { id: 'alice', name: 'Alice' },
    { id: 'bob', name: 'Bob' },
    { id: 'claire', name: 'Claire' }
];

test('selects the player whose letter is closest to A', () => {
    const bag = [
        createTile('r', 'R'),
        createTile('c', 'C'),
        createTile('m', 'M')
    ];

    const result = determineStartingPlayer(bag, players);

    assert.equal(result.startingPlayerId, 'bob');
    assert.equal(result.startingPlayerName, 'Bob');
    assert.equal(result.rounds.length, 1);
    assert.equal(result.rounds[0].bestLetter, 'C');
    assert.equal(bag.length, 3);
});

test('redraws a blank and does not treat it as a starting letter', () => {
    const bag = [
        createTile('r', 'R'),
        createTile('c', 'C'),
        createTile('m', 'M'),
        createTile('blank', null)
    ];

    const result = determineStartingPlayer(bag, players);
    const aliceDraw = result.rounds[0].draws.find(
        (draw) => draw.playerId === 'alice'
    );

    assert.equal(aliceDraw.letter, 'M');
    assert.equal(aliceDraw.blankRedraws, 1);
    assert.equal(result.startingPlayerId, 'bob');
    assert.equal(result.returnedTileCount, 4);
    assert.equal(bag.length, 4);
});

test('repeats the draw only between players tied on the best letter', () => {
    const bag = [
        createTile('f', 'F'),
        createTile('p', 'P'),
        createTile('r', 'R'),
        createTile('c2', 'C'),
        createTile('c1', 'C')
    ];

    const result = determineStartingPlayer(bag, players);

    assert.equal(result.rounds.length, 2);
    assert.deepEqual(result.rounds[0].tiedPlayerIds, ['alice', 'bob']);
    assert.deepEqual(
        result.rounds[1].draws.map((draw) => draw.playerId),
        ['alice', 'bob']
    );
    assert.equal(result.rounds[1].bestLetter, 'F');
    assert.equal(result.startingPlayerId, 'bob');
    assert.equal(bag.length, 5);
});

test('returns every starting-draw tile to the bag', () => {
    const bag = [
        createTile('z', 'Z'),
        createTile('b', 'B'),
        createTile('a', 'A')
    ];
    const originalIds = new Set(bag.map((tile) => tile.id));

    determineStartingPlayer(bag, players);

    assert.equal(bag.length, 3);
    assert.deepEqual(
        new Set(bag.map((tile) => tile.id)),
        originalIds
    );
});

test('rotates turn order from the selected first player', () => {
    assert.deepEqual(
        rotateTurnOrder(['alice', 'bob', 'claire'], 'bob'),
        ['bob', 'claire', 'alice']
    );
});

test('rejects a starting player that is not present in the order', () => {
    assert.throws(
        () => rotateTurnOrder(['alice', 'bob'], 'claire'),
        /must exist/i
    );
});
