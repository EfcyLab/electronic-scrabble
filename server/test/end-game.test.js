/**
 * Electronic Scrabble end-game tests.
 *
 * @author Electronic Scrabble Project
 * @version 0.7.0
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const {
    END_REASON_CONSECUTIVE_PASSES,
    END_REASON_RACK_EMPTIED,
    calculateFinalResult,
    finishGame,
    getRackValue,
    getRequiredConsecutivePasses,
    shouldEndAfterConsecutivePasses,
    shouldEndAfterRackEmptied
} = require('../game/end-game');

/**
 * Creates a minimal test tile.
 *
 * @param {string|null} letter Tile letter.
 * @param {number} value Tile value.
 *
 * @returns {Object} Test tile.
 */
let nextTileId = 1;

function createTile(letter, value) {
    const tileId = nextTileId;
    nextTileId += 1;

    return {
        id: `${letter ?? 'blank'}-${value}-${tileId}`,
        letter,
        value,
        isBlank: letter === null
    };
}

/**
 * Creates a minimal test player.
 *
 * @param {string} id Player identifier.
 * @param {string} name Player name.
 * @param {number} score Current score.
 * @param {Array<Object>} rack Player rack.
 *
 * @returns {Object} Test player.
 */
function createPlayer(id, name, score, rack) {
    return {
        id,
        name,
        score,
        rack
    };
}

test('getRackValue sums tile values and keeps blanks at zero', () => {
    const rack = [
        createTile('A', 1),
        createTile('Z', 10),
        createTile(null, 0)
    ];

    assert.equal(getRackValue(rack), 11);
});

test('rack-empty ending requires both an empty bag and empty rack', () => {
    assert.equal(shouldEndAfterRackEmptied([], []), true);
    assert.equal(shouldEndAfterRackEmptied([createTile('A', 1)], []), false);
    assert.equal(shouldEndAfterRackEmptied([], [createTile('A', 1)]), false);
});

test('three full rounds of passes are required for the current player count', () => {
    assert.equal(getRequiredConsecutivePasses(2), 6);
    assert.equal(getRequiredConsecutivePasses(3), 9);
    assert.equal(getRequiredConsecutivePasses(4), 12);
});

test('blocked ending requires too few bag tiles for an exchange', () => {
    assert.equal(shouldEndAfterConsecutivePasses(6, 6, 2), true);
    assert.equal(shouldEndAfterConsecutivePasses(7, 6, 2), false);
    assert.equal(shouldEndAfterConsecutivePasses(6, 5, 2), false);
});

test('rack-empty scoring deducts opponents and awards their rack values to the finisher', () => {
    const players = [
        createPlayer('p1', 'Alice', 100, []),
        createPlayer('p2', 'Bob', 90, [createTile('Z', 10)]),
        createPlayer('p3', 'Claire', 80, [createTile('A', 1), createTile('B', 3)])
    ];

    const result = calculateFinalResult(
        players,
        END_REASON_RACK_EMPTIED,
        'p1'
    );

    const alice = result.rankings.find((ranking) => ranking.playerId === 'p1');
    const bob = result.rankings.find((ranking) => ranking.playerId === 'p2');
    const claire = result.rankings.find((ranking) => ranking.playerId === 'p3');

    assert.equal(alice.adjustment, 14);
    assert.equal(alice.finalScore, 114);
    assert.equal(bob.adjustment, -10);
    assert.equal(bob.finalScore, 80);
    assert.equal(claire.adjustment, -4);
    assert.equal(claire.finalScore, 76);
});

test('blocked scoring deducts each player own rack value only', () => {
    const players = [
        createPlayer('p1', 'Alice', 100, [createTile('A', 1)]),
        createPlayer('p2', 'Bob', 90, [createTile('Z', 10)])
    ];

    const result = calculateFinalResult(
        players,
        END_REASON_CONSECUTIVE_PASSES
    );

    const alice = result.rankings.find((ranking) => ranking.playerId === 'p1');
    const bob = result.rankings.find((ranking) => ranking.playerId === 'p2');

    assert.equal(alice.finalScore, 99);
    assert.equal(bob.finalScore, 80);
});

test('finishGame updates player scores and public game state', () => {
    const alice = createPlayer('p1', 'Alice', 100, []);
    const bob = createPlayer('p2', 'Bob', 90, [createTile('Z', 10)]);
    const game = {
        status: 'playing',
        currentPlayerId: 'p1',
        players: new Map([
            [alice.id, alice],
            [bob.id, bob]
        ]),
        finalResult: null
    };

    const result = finishGame(
        game,
        END_REASON_RACK_EMPTIED,
        'p1'
    );

    assert.equal(game.status, 'finished');
    assert.equal(game.currentPlayerId, null);
    assert.equal(game.finalResult, result);
    assert.equal(alice.score, 110);
    assert.equal(bob.score, 80);
    assert.deepEqual(result.winnerIds, ['p1']);
});

test('public final result excludes remaining rack letters and private tile identifiers', () => {
    const players = [
        createPlayer('p1', 'Alice', 100, []),
        createPlayer('p2', 'Bob', 90, [
            {
                id: 'PRIVATE-TILE-ID',
                letter: 'Z',
                value: 10,
                isBlank: false
            }
        ])
    ];

    const result = calculateFinalResult(
        players,
        END_REASON_RACK_EMPTIED,
        'p1'
    );

    const serializedResult = JSON.stringify(result);

    assert.equal(serializedResult.includes('PRIVATE-TILE-ID'), false);
    assert.equal(serializedResult.includes('"letter"'), false);
});
