/**
 * Electronic Scrabble browser move score preview.
 *
 * Mirrors the structural validation and scoring rules from the authoritative
 * server move engine so players can compare provisional placements without a
 * WebSocket round trip. Dictionary validation remains server-only.
 *
 * @author Electronic Scrabble Project
 * @version 0.25.0
 */

(function initializeMoveScorePreview(root, factory) {
    const api = factory();

    if (typeof module === 'object' && module.exports) {
        module.exports = api;
    }

    if (root) {
        root.ElectronicScrabbleMoveScorePreview = api;
    }
}(typeof window !== 'undefined' ? window : globalThis, () => {
    const BOARD_SIZE = 15;
    const CENTER_INDEX = Math.floor(BOARD_SIZE / 2);
    const BINGO_BONUS = 50;

    const PREMIUM = Object.freeze({
        DOUBLE_LETTER: 'DL',
        TRIPLE_LETTER: 'TL',
        DOUBLE_WORD: 'DW',
        TRIPLE_WORD: 'TW'
    });

    class MovePreviewError extends Error {
        /**
         * Creates a stable move-preview validation error.
         *
         * @param {string} code Stable move validation code.
         * @param {string} message Human-readable diagnostic message.
         */
        constructor(code, message) {
            super(message);
            this.name = 'MovePreviewError';
            this.code = code;
        }
    }

    /**
     * Returns whether the board contains no committed tiles.
     *
     * @param {Array<Array<Object>>} board Public board matrix.
     *
     * @returns {boolean} True when the board is empty.
     */
    function isBoardEmpty(board) {
        return board.every((row) => row.every((cell) => cell.tile === null));
    }

    /**
     * Returns a stable coordinate key.
     *
     * @param {number} row Board row.
     * @param {number} column Board column.
     *
     * @returns {string} Coordinate key.
     */
    function getCoordinateKey(row, column) {
        return `${row}:${column}`;
    }

    /**
     * Validates and normalizes provisional placements against the private rack.
     *
     * @param {Array<Array<Object>>} board Public board matrix.
     * @param {Array<Object>} rack Private player rack.
     * @param {Array<Object>} placements Provisional placements.
     *
     * @returns {Array<Object>} Trusted normalized placements.
     */
    function normalizePlacements(board, rack, placements) {
        if (!Array.isArray(placements) || placements.length === 0) {
            throw new MovePreviewError('EMPTY_MOVE', 'At least one tile must be placed.');
        }

        if (placements.length > rack.length) {
            throw new MovePreviewError(
                'TOO_MANY_TILES',
                'The move contains more tiles than the player rack.'
            );
        }

        const rackById = new Map(rack.map((tile) => [tile.id, tile]));
        const usedTileIds = new Set();
        const usedCoordinates = new Set();

        return placements.map((placement) => {
            const tileId = typeof placement?.tileId === 'string'
                ? placement.tileId
                : '';
            const row = placement?.row;
            const column = placement?.column;

            if (!rackById.has(tileId)) {
                throw new MovePreviewError(
                    'TILE_NOT_IN_RACK',
                    'One of the submitted tiles is not available in the player rack.'
                );
            }

            if (usedTileIds.has(tileId)) {
                throw new MovePreviewError(
                    'DUPLICATE_TILE',
                    'The same rack tile cannot be placed twice.'
                );
            }

            if (
                !Number.isInteger(row) ||
                !Number.isInteger(column) ||
                row < 0 ||
                row >= BOARD_SIZE ||
                column < 0 ||
                column >= BOARD_SIZE
            ) {
                throw new MovePreviewError(
                    'INVALID_COORDINATES',
                    'A tile placement contains invalid board coordinates.'
                );
            }

            const coordinateKey = getCoordinateKey(row, column);

            if (usedCoordinates.has(coordinateKey)) {
                throw new MovePreviewError(
                    'DUPLICATE_POSITION',
                    'Two tiles cannot occupy the same board square.'
                );
            }

            if (board[row][column].tile !== null) {
                throw new MovePreviewError(
                    'SQUARE_OCCUPIED',
                    'A submitted tile targets an occupied board square.'
                );
            }

            const tile = rackById.get(tileId);
            let assignedLetter = null;

            if (tile.isBlank) {
                assignedLetter = typeof placement.assignedLetter === 'string'
                    ? placement.assignedLetter.trim().toUpperCase()
                    : '';

                if (!/^[A-Z]$/.test(assignedLetter)) {
                    throw new MovePreviewError(
                        'BLANK_LETTER_REQUIRED',
                        'A blank tile must be assigned a letter from A to Z.'
                    );
                }
            }

            usedTileIds.add(tileId);
            usedCoordinates.add(coordinateKey);

            return {
                row,
                column,
                tile: {
                    ...tile,
                    assignedLetter
                }
            };
        });
    }

    /**
     * Returns a tile at a coordinate, including provisional placements.
     *
     * @param {Array<Array<Object>>} board Public board matrix.
     * @param {Map<string, Object>} placementMap Placement lookup.
     * @param {number} row Board row.
     * @param {number} column Board column.
     *
     * @returns {Object|null} Tile or null.
     */
    function getTileAt(board, placementMap, row, column) {
        if (row < 0 || row >= BOARD_SIZE || column < 0 || column >= BOARD_SIZE) {
            return null;
        }

        const placement = placementMap.get(getCoordinateKey(row, column));

        return placement ? placement.tile : board[row][column].tile;
    }

    /**
     * Determines the main orientation for a move.
     *
     * @param {Array<Object>} placements Normalized placements.
     *
     * @returns {string|null} Horizontal, vertical, or null for one tile.
     */
    function getMoveOrientation(placements) {
        if (placements.length === 1) {
            return null;
        }

        const rows = new Set(placements.map((placement) => placement.row));
        const columns = new Set(placements.map((placement) => placement.column));

        if (rows.size === 1) {
            return 'horizontal';
        }

        if (columns.size === 1) {
            return 'vertical';
        }

        throw new MovePreviewError(
            'TILES_NOT_ALIGNED',
            'All newly placed tiles must be in one row or one column.'
        );
    }

    /**
     * Validates continuity between the first and last provisional tiles.
     *
     * @param {Array<Array<Object>>} board Public board matrix.
     * @param {Map<string, Object>} placementMap Placement lookup.
     * @param {Array<Object>} placements Normalized placements.
     * @param {string|null} orientation Move orientation.
     *
     * @returns {void}
     */
    function validateContinuity(board, placementMap, placements, orientation) {
        if (orientation === null) {
            return;
        }

        if (orientation === 'horizontal') {
            const row = placements[0].row;
            const columns = placements.map((placement) => placement.column);
            const start = Math.min(...columns);
            const end = Math.max(...columns);

            for (let column = start; column <= end; column += 1) {
                if (getTileAt(board, placementMap, row, column) === null) {
                    throw new MovePreviewError(
                        'MOVE_HAS_GAP',
                        'The tiles in a word must be contiguous.'
                    );
                }
            }

            return;
        }

        const column = placements[0].column;
        const rows = placements.map((placement) => placement.row);
        const start = Math.min(...rows);
        const end = Math.max(...rows);

        for (let row = start; row <= end; row += 1) {
            if (getTileAt(board, placementMap, row, column) === null) {
                throw new MovePreviewError(
                    'MOVE_HAS_GAP',
                    'The tiles in a word must be contiguous.'
                );
            }
        }
    }

    /**
     * Returns whether a provisional tile touches a committed board tile.
     *
     * @param {Array<Array<Object>>} board Public board matrix.
     * @param {Object} placement Normalized placement.
     *
     * @returns {boolean} True when connected to an existing tile.
     */
    function touchesExistingTile(board, placement) {
        const neighbors = [
            [placement.row - 1, placement.column],
            [placement.row + 1, placement.column],
            [placement.row, placement.column - 1],
            [placement.row, placement.column + 1]
        ];

        return neighbors.some(([row, column]) => (
            row >= 0 &&
            row < BOARD_SIZE &&
            column >= 0 &&
            column < BOARD_SIZE &&
            board[row][column].tile !== null
        ));
    }

    /**
     * Collects a complete word through one coordinate.
     *
     * @param {Array<Array<Object>>} board Public board matrix.
     * @param {Map<string, Object>} placementMap Placement lookup.
     * @param {number} row Starting row.
     * @param {number} column Starting column.
     * @param {string} direction Horizontal or vertical direction.
     *
     * @returns {Array<Object>} Ordered word cells.
     */
    function collectWord(board, placementMap, row, column, direction) {
        const rowStep = direction === 'vertical' ? 1 : 0;
        const columnStep = direction === 'horizontal' ? 1 : 0;
        let startRow = row;
        let startColumn = column;

        while (
            getTileAt(
                board,
                placementMap,
                startRow - rowStep,
                startColumn - columnStep
            ) !== null
        ) {
            startRow -= rowStep;
            startColumn -= columnStep;
        }

        const cells = [];
        let currentRow = startRow;
        let currentColumn = startColumn;

        while (
            getTileAt(
                board,
                placementMap,
                currentRow,
                currentColumn
            ) !== null
        ) {
            cells.push({
                row: currentRow,
                column: currentColumn,
                tile: getTileAt(
                    board,
                    placementMap,
                    currentRow,
                    currentColumn
                )
            });

            currentRow += rowStep;
            currentColumn += columnStep;
        }

        return cells;
    }

    /**
     * Returns the visible letter represented by a tile.
     *
     * @param {Object} tile Tile instance.
     *
     * @returns {string} Visible letter.
     */
    function getTileLetter(tile) {
        return tile.isBlank ? tile.assignedLetter : tile.letter;
    }

    /**
     * Scores one word using premium squares only for new tiles.
     *
     * @param {Array<Array<Object>>} board Public board matrix.
     * @param {Map<string, Object>} placementMap Placement lookup.
     * @param {Array<Object>} cells Ordered word cells.
     * @param {string} direction Word direction.
     *
     * @returns {Object} Scored word.
     */
    function scoreWord(board, placementMap, cells, direction) {
        let baseScore = 0;
        let wordMultiplier = 1;

        cells.forEach((cell) => {
            const coordinateKey = getCoordinateKey(cell.row, cell.column);
            const isNewTile = placementMap.has(coordinateKey);
            const premium = board[cell.row][cell.column].premium;
            let letterScore = cell.tile.value;

            if (isNewTile && premium === PREMIUM.DOUBLE_LETTER) {
                letterScore *= 2;
            }

            if (isNewTile && premium === PREMIUM.TRIPLE_LETTER) {
                letterScore *= 3;
            }

            if (isNewTile && premium === PREMIUM.DOUBLE_WORD) {
                wordMultiplier *= 2;
            }

            if (isNewTile && premium === PREMIUM.TRIPLE_WORD) {
                wordMultiplier *= 3;
            }

            baseScore += letterScore;
        });

        return {
            text: cells.map((cell) => getTileLetter(cell.tile)).join(''),
            score: baseScore * wordMultiplier,
            direction,
            start: {
                row: cells[0].row,
                column: cells[0].column
            },
            end: {
                row: cells[cells.length - 1].row,
                column: cells[cells.length - 1].column
            }
        };
    }

    /**
     * Collects every word created or modified by a move.
     *
     * @param {Array<Array<Object>>} board Public board matrix.
     * @param {Map<string, Object>} placementMap Placement lookup.
     * @param {Array<Object>} placements Normalized placements.
     *
     * @returns {Array<Object>} Scored words.
     */
    function collectScoredWords(board, placementMap, placements) {
        const words = new Map();

        placements.forEach((placement) => {
            ['horizontal', 'vertical'].forEach((direction) => {
                const cells = collectWord(
                    board,
                    placementMap,
                    placement.row,
                    placement.column,
                    direction
                );

                if (cells.length < 2) {
                    return;
                }

                const first = cells[0];
                const last = cells[cells.length - 1];
                const key = [
                    direction,
                    first.row,
                    first.column,
                    last.row,
                    last.column
                ].join(':');

                if (!words.has(key)) {
                    words.set(
                        key,
                        scoreWord(board, placementMap, cells, direction)
                    );
                }
            });
        });

        return Array.from(words.values());
    }

    /**
     * Validates and scores provisional placements without modifying state.
     *
     * @param {Array<Array<Object>>} board Public board matrix.
     * @param {Array<Object>} rack Private player rack.
     * @param {Array<Object>} placements Provisional placements.
     *
     * @returns {Object} Structural scoring result.
     */
    function validateAndScoreMove(board, rack, placements) {
        const normalizedPlacements = normalizePlacements(board, rack, placements);
        const placementMap = new Map(
            normalizedPlacements.map((placement) => [
                getCoordinateKey(placement.row, placement.column),
                placement
            ])
        );
        const firstMove = isBoardEmpty(board);
        const orientation = getMoveOrientation(normalizedPlacements);

        validateContinuity(board, placementMap, normalizedPlacements, orientation);

        if (firstMove) {
            if (normalizedPlacements.length < 2) {
                throw new MovePreviewError(
                    'FIRST_MOVE_TOO_SHORT',
                    'The first move must place at least two tiles.'
                );
            }

            const coversCenter = normalizedPlacements.some((placement) => (
                placement.row === CENTER_INDEX &&
                placement.column === CENTER_INDEX
            ));

            if (!coversCenter) {
                throw new MovePreviewError(
                    'FIRST_MOVE_MUST_COVER_CENTER',
                    'The first word must cover the center square.'
                );
            }
        } else {
            const connected = normalizedPlacements.some((placement) => (
                touchesExistingTile(board, placement)
            ));

            if (!connected) {
                throw new MovePreviewError(
                    'MOVE_NOT_CONNECTED',
                    'The move must connect to at least one existing tile.'
                );
            }
        }

        const words = collectScoredWords(board, placementMap, normalizedPlacements);

        if (words.length === 0) {
            throw new MovePreviewError(
                'NO_WORD_FORMED',
                'The move must form at least one word containing two or more letters.'
            );
        }

        const wordScore = words.reduce((total, word) => total + word.score, 0);
        const bingoBonus = normalizedPlacements.length === 7 ? BINGO_BONUS : 0;

        return {
            placements: normalizedPlacements,
            words,
            wordScore,
            bingoBonus,
            score: wordScore + bingoBonus
        };
    }

    return Object.freeze({
        BINGO_BONUS,
        MovePreviewError,
        isBoardEmpty,
        validateAndScoreMove
    });
}));
