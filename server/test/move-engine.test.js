/**
 * Electronic Scrabble move engine tests.
 *
 * @author Electronic Scrabble Project
 * @version 0.5.0
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { createBoard } = require('../game/board');
const {
    BINGO_BONUS,
    MoveValidationError,
    applyMove,
    validateAndScoreMove
} = require('../game/move-engine');

/**
 * Creates a deterministic tile for move-engine tests.
 *
 * @param {string} id Tile identifier.
 * @param {string|null} letter Tile letter or null for a blank.
 * @param {number} value Tile score value.
 *
 * @returns {Object} Test tile.
 */
function tile(id, letter, value) {
    return {
        id,
        letter,
        value,
        isBlank: letter === null
    };
}

test('first move must cover the center square', () => {
    const board = createBoard();
    const rack = [tile('A', 'A', 1), tile('B', 'B', 3)];

    assert.throws(
        () => validateAndScoreMove(board, rack, [
            { tileId: 'A', row: 0, column: 0 },
            { tileId: 'B', row: 0, column: 1 }
        ]),
        (error) => (
            error instanceof MoveValidationError &&
            error.code === 'FIRST_MOVE_MUST_COVER_CENTER'
        )
    );
});

test('first move scores the center double-word premium', () => {
    const board = createBoard();
    const rack = [
        tile('H', 'H', 4),
        tile('I', 'I', 1)
    ];

    const move = validateAndScoreMove(board, rack, [
        { tileId: 'H', row: 7, column: 7 },
        { tileId: 'I', row: 7, column: 8 }
    ]);

    assert.equal(move.words.length, 1);
    assert.equal(move.words[0].text, 'HI');
    assert.equal(move.score, 10);
});

test('new tiles must be aligned', () => {
    const board = createBoard();
    const rack = [tile('A', 'A', 1), tile('B', 'B', 3)];

    assert.throws(
        () => validateAndScoreMove(board, rack, [
            { tileId: 'A', row: 7, column: 7 },
            { tileId: 'B', row: 8, column: 8 }
        ]),
        (error) => error.code === 'TILES_NOT_ALIGNED'
    );
});

test('existing tiles can bridge new tiles without a gap', () => {
    const board = createBoard();
    board[7][7].tile = tile('OLD', 'A', 1);

    const rack = [tile('C', 'C', 3), tile('T', 'T', 1)];
    const move = validateAndScoreMove(board, rack, [
        { tileId: 'C', row: 7, column: 6 },
        { tileId: 'T', row: 7, column: 8 }
    ]);

    assert.equal(move.words[0].text, 'CAT');
});

test('a later move must connect to an existing tile', () => {
    const board = createBoard();
    board[7][7].tile = tile('OLD', 'A', 1);

    const rack = [tile('B', 'B', 3), tile('E', 'E', 1)];

    assert.throws(
        () => validateAndScoreMove(board, rack, [
            { tileId: 'B', row: 0, column: 0 },
            { tileId: 'E', row: 0, column: 1 }
        ]),
        (error) => error.code === 'MOVE_NOT_CONNECTED'
    );
});

test('cross words are scored in addition to the main word', () => {
    const board = createBoard();

    board[6][5].tile = tile('B1', 'B', 3);
    board[8][5].tile = tile('R1', 'R', 1);
    board[6][6].tile = tile('C1', 'C', 3);
    board[8][6].tile = tile('T1', 'T', 1);

    const rack = [tile('A', 'A', 1), tile('I', 'I', 1)];
    const move = validateAndScoreMove(board, rack, [
        { tileId: 'A', row: 7, column: 5 },
        { tileId: 'I', row: 7, column: 6 }
    ]);

    assert.deepEqual(
        move.words.map((word) => word.text).sort(),
        ['AI', 'BAR', 'CIT'].sort()
    );
    assert.equal(move.score, 12);
});

test('blank tiles require an assigned letter and retain zero value', () => {
    const board = createBoard();
    const rack = [tile('BLANK', null, 0), tile('A', 'A', 1)];

    assert.throws(
        () => validateAndScoreMove(board, rack, [
            { tileId: 'BLANK', row: 7, column: 7 },
            { tileId: 'A', row: 7, column: 8 }
        ]),
        (error) => error.code === 'BLANK_LETTER_REQUIRED'
    );

    const move = validateAndScoreMove(board, rack, [
        {
            tileId: 'BLANK',
            row: 7,
            column: 7,
            assignedLetter: 'Z'
        },
        { tileId: 'A', row: 7, column: 8 }
    ]);

    assert.equal(move.words[0].text, 'ZA');
    assert.equal(move.score, 2);
});

test('using seven rack tiles adds the fifty-point bingo bonus', () => {
    const board = createBoard();
    const rack = 'ABCDEFG'.split('').map((letter, index) => (
        tile(String(index), letter, 1)
    ));

    const move = validateAndScoreMove(
        board,
        rack,
        rack.map((rackTile, index) => ({
            tileId: rackTile.id,
            row: 7,
            column: 4 + index
        }))
    );

    assert.equal(move.bingoBonus, BINGO_BONUS);
    assert.equal(move.score, 64);
});

test('applying a move stores trusted tiles on the board', () => {
    const board = createBoard();
    const rack = [tile('A', 'A', 1), tile('B', 'B', 3)];
    const move = validateAndScoreMove(board, rack, [
        { tileId: 'A', row: 7, column: 7 },
        { tileId: 'B', row: 7, column: 8 }
    ]);

    applyMove(board, move);

    assert.equal(board[7][7].tile.id, 'A');
    assert.equal(board[7][8].tile.id, 'B');
});
