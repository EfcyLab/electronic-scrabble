/**
 * Electronic Scrabble board tests.
 *
 * Verifies dimensions, premium square counts, center square,
 * rotational symmetry, and public serialization.
 *
 * @author Electronic Scrabble Project
 * @version 0.4.0
 */

const assert = require('node:assert/strict');
const test = require('node:test');
const {
    BOARD_SIZE,
    PREMIUM,
    createBoard,
    getPublicBoardState
} = require('../game/board');

test('board contains 225 cells', () => {
    const board = createBoard();

    assert.equal(board.length, BOARD_SIZE);
    board.forEach((row) => assert.equal(row.length, BOARD_SIZE));
    assert.equal(board.flat().length, 225);
});

test('board contains the expected premium square counts', () => {
    const counts = {
        [PREMIUM.DOUBLE_LETTER]: 0,
        [PREMIUM.TRIPLE_LETTER]: 0,
        [PREMIUM.DOUBLE_WORD]: 0,
        [PREMIUM.TRIPLE_WORD]: 0
    };

    createBoard().flat().forEach((cell) => {
        if (cell.premium !== null) {
            counts[cell.premium] += 1;
        }
    });

    assert.equal(counts[PREMIUM.DOUBLE_LETTER], 24);
    assert.equal(counts[PREMIUM.TRIPLE_LETTER], 12);
    assert.equal(counts[PREMIUM.DOUBLE_WORD], 17);
    assert.equal(counts[PREMIUM.TRIPLE_WORD], 8);
});

test('center square is a double word square', () => {
    const board = createBoard();

    assert.equal(board[7][7].premium, PREMIUM.DOUBLE_WORD);
});

test('premium layout is rotationally symmetric', () => {
    const board = createBoard();

    for (let row = 0; row < BOARD_SIZE; row += 1) {
        for (let column = 0; column < BOARD_SIZE; column += 1) {
            assert.equal(
                board[row][column].premium,
                board[BOARD_SIZE - 1 - row][BOARD_SIZE - 1 - column].premium
            );
        }
    }
});

test('public board state excludes internal tile identifiers', () => {
    const board = createBoard();

    board[7][7].tile = {
        id: 'internal-id',
        letter: 'A',
        value: 1,
        isBlank: false
    };

    const publicBoard = getPublicBoardState(board);

    assert.equal('id' in publicBoard[7][7].tile, false);
    assert.equal(publicBoard[7][7].tile.letter, 'A');
});
