/**
 * Electronic Scrabble board model.
 *
 * Defines the standard 15 x 15 board and its premium squares.
 * It also provides a public-safe serializer for shared game state.
 *
 * @author Electronic Scrabble Project
 * @version 0.4.0
 */

const BOARD_SIZE = 15;

const PREMIUM = Object.freeze({
    DOUBLE_LETTER: 'DL',
    TRIPLE_LETTER: 'TL',
    DOUBLE_WORD: 'DW',
    TRIPLE_WORD: 'TW'
});

const PREMIUM_COORDINATES = Object.freeze({
    [PREMIUM.TRIPLE_WORD]: Object.freeze([
        [0, 0], [0, 7], [0, 14],
        [7, 0], [7, 14],
        [14, 0], [14, 7], [14, 14]
    ]),
    [PREMIUM.DOUBLE_WORD]: Object.freeze([
        [1, 1], [1, 13], [2, 2], [2, 12],
        [3, 3], [3, 11], [4, 4], [4, 10],
        [7, 7],
        [10, 4], [10, 10], [11, 3], [11, 11],
        [12, 2], [12, 12], [13, 1], [13, 13]
    ]),
    [PREMIUM.TRIPLE_LETTER]: Object.freeze([
        [1, 5], [1, 9],
        [5, 1], [5, 5], [5, 9], [5, 13],
        [9, 1], [9, 5], [9, 9], [9, 13],
        [13, 5], [13, 9]
    ]),
    [PREMIUM.DOUBLE_LETTER]: Object.freeze([
        [0, 3], [0, 11], [2, 6], [2, 8],
        [3, 0], [3, 7], [3, 14],
        [6, 2], [6, 6], [6, 8], [6, 12],
        [7, 3], [7, 11],
        [8, 2], [8, 6], [8, 8], [8, 12],
        [11, 0], [11, 7], [11, 14],
        [12, 6], [12, 8], [14, 3], [14, 11]
    ])
});

/**
 * Builds a lookup map for premium squares.
 *
 * @returns {Map<string, string>} Coordinate-to-premium lookup map.
 */
function createPremiumLookup() {
    const lookup = new Map();

    Object.entries(PREMIUM_COORDINATES).forEach(([premium, coordinates]) => {
        coordinates.forEach(([row, column]) => {
            lookup.set(`${row}:${column}`, premium);
        });
    });

    return lookup;
}

const premiumLookup = createPremiumLookup();

/**
 * Creates a new empty Scrabble board.
 *
 * @returns {Array<Array<Object>>} Board matrix.
 */
function createBoard() {
    return Array.from({ length: BOARD_SIZE }, (_, row) => (
        Array.from({ length: BOARD_SIZE }, (_, column) => ({
            row,
            column,
            premium: premiumLookup.get(`${row}:${column}`) ?? null,
            tile: null
        }))
    ));
}

/**
 * Returns a public representation of a board tile.
 *
 * Internal tile identifiers are intentionally excluded.
 *
 * @param {Object|null} tile Board tile.
 *
 * @returns {Object|null} Public tile representation.
 */
function getPublicTile(tile) {
    if (tile === null) {
        return null;
    }

    return {
        letter: tile.letter,
        value: tile.value,
        isBlank: tile.isBlank,
        assignedLetter: tile.assignedLetter ?? null
    };
}

/**
 * Serializes a board for public clients.
 *
 * @param {Array<Array<Object>>} board Board matrix.
 *
 * @returns {Array<Array<Object>>} Public board matrix.
 */
function getPublicBoardState(board) {
    return board.map((row) => (
        row.map((cell) => ({
            row: cell.row,
            column: cell.column,
            premium: cell.premium,
            tile: getPublicTile(cell.tile)
        }))
    ));
}

module.exports = {
    BOARD_SIZE,
    PREMIUM,
    PREMIUM_COORDINATES,
    createBoard,
    getPublicBoardState
};
