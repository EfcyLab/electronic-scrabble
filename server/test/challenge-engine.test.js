/**
 * Tests for Electronic Scrabble challenge staging helpers.
 *
 * @author Electronic Scrabble Project
 * @version 1.1.0
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { createBoard } = require('../game/board');
const {
    commitStagedMove,
    getNextPlayerId,
    getPublicPendingMove,
    rollbackStagedMove,
    stageMove
} = require('../game/challenge-engine');

function createTile(id, letter, value = 1) {
    return {
        id,
        letter,
        value,
        isBlank: false
    };
}

function createMove(tiles) {
    return {
        placements: tiles.map((tile, index) => ({
            row: 7,
            column: 7 + index,
            tile
        })),
        words: [
            {
                text: tiles.map((tile) => tile.letter).join(''),
                score: tiles.reduce((total, tile) => total + tile.value, 0)
            }
        ],
        wordScore: 2,
        bingoBonus: 0,
        score: 2
    };
}

test('getNextPlayerId follows circular turn order', () => {
    assert.equal(getNextPlayerId(['A', 'B', 'C'], 'A'), 'B');
    assert.equal(getNextPlayerId(['A', 'B', 'C'], 'C'), 'A');
});

test('stageMove places tiles and removes them from the private rack', () => {
    const board = createBoard();
    const a = createTile('a', 'A');
    const b = createTile('b', 'B');
    const c = createTile('c', 'C');
    const player = {
        id: 'P1',
        name: 'Alice',
        score: 0,
        rack: [a, b, c]
    };
    const pendingMove = stageMove(board, player, createMove([a, b]), 'P2');

    assert.equal(board[7][7].tile.id, 'a');
    assert.equal(board[7][8].tile.id, 'b');
    assert.deepEqual(player.rack.map((tile) => tile.id), ['c']);
    assert.equal(pendingMove.originalRack.length, 3);
});

test('rollbackStagedMove restores the board and original rack', () => {
    const board = createBoard();
    const a = createTile('a', 'A');
    const b = createTile('b', 'B');
    const player = {
        id: 'P1',
        name: 'Alice',
        score: 0,
        rack: [a, b]
    };
    const pendingMove = stageMove(board, player, createMove([a, b]), 'P2');

    rollbackStagedMove(board, player, pendingMove);

    assert.equal(board[7][7].tile, null);
    assert.equal(board[7][8].tile, null);
    assert.deepEqual(player.rack.map((tile) => tile.id), ['a', 'b']);
});

test('commitStagedMove applies score and replenishes the rack', () => {
    const board = createBoard();
    const a = createTile('a', 'A');
    const b = createTile('b', 'B');
    const c = createTile('c', 'C');
    const d = createTile('d', 'D');
    const player = {
        id: 'P1',
        name: 'Alice',
        score: 10,
        rack: [a, b]
    };
    const pendingMove = stageMove(board, player, createMove([a, b]), 'P2');
    const bag = [c, d];

    commitStagedMove(bag, player, pendingMove);

    assert.equal(player.score, 12);
    assert.deepEqual(player.rack.map((tile) => tile.id), ['d', 'c']);
    assert.equal(bag.length, 0);
});

test('getPublicPendingMove never exposes private tile identifiers', () => {
    const board = createBoard();
    const a = createTile('secret-a', 'A');
    const b = createTile('secret-b', 'B');
    const player = {
        id: 'P1',
        name: 'Alice',
        score: 0,
        rack: [a, b]
    };
    const pendingMove = stageMove(board, player, createMove([a, b]), 'P2');
    const publicMove = getPublicPendingMove(pendingMove);
    const serialized = JSON.stringify(publicMove);

    assert.equal(serialized.includes('secret-a'), false);
    assert.equal(serialized.includes('secret-b'), false);
    assert.equal(serialized.includes('originalRack'), false);
    assert.deepEqual(publicMove.placements, [
        { row: 7, column: 7 },
        { row: 7, column: 8 }
    ]);
});
