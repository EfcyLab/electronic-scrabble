/**
 * Electronic Scrabble challenge engine.
 *
 * Stages a structurally valid move on the board until the next player
 * accepts it or an opponent challenges one of the formed words.
 * Dictionary lookup remains delegated to the configured word validator.
 *
 * @author Electronic Scrabble Project
 * @version 1.1.0
 */

const { drawTiles, RACK_SIZE } = require('./french-tiles');

/**
 * Returns the player scheduled immediately after the current player.
 *
 * @param {Array<string>} turnOrder Ordered player identifiers.
 * @param {string|null} currentPlayerId Current player identifier.
 *
 * @returns {string|null} Next player identifier or null.
 */
function getNextPlayerId(turnOrder, currentPlayerId) {
    if (!Array.isArray(turnOrder) || turnOrder.length === 0) {
        return null;
    }

    const currentIndex = turnOrder.indexOf(currentPlayerId);

    if (currentIndex < 0) {
        return turnOrder[0] ?? null;
    }

    return turnOrder[(currentIndex + 1) % turnOrder.length] ?? null;
}

/**
 * Stages a validated move on the board without scoring or replenishing.
 *
 * The player's original rack is retained privately so the move can be
 * rolled back if a challenge succeeds.
 *
 * @param {Array<Array<Object>>} board Mutable board matrix.
 * @param {Object} player Moving player.
 * @param {Object} move Structurally validated move.
 * @param {string|null} nextPlayerId Next player identifier.
 *
 * @returns {Object} Private pending move state.
 */
function stageMove(board, player, move, nextPlayerId) {
    const originalRack = player.rack.slice();
    const usedTileIds = new Set(
        move.placements.map((placement) => placement.tile.id)
    );

    move.placements.forEach((placement) => {
        board[placement.row][placement.column].tile = {
            ...placement.tile
        };
    });

    player.rack = player.rack.filter(
        (tile) => !usedTileIds.has(tile.id)
    );

    return {
        playerId: player.id,
        playerName: player.name,
        nextPlayerId,
        move,
        originalRack,
        createdAt: Date.now()
    };
}

/**
 * Rolls a staged move back completely.
 *
 * @param {Array<Array<Object>>} board Mutable board matrix.
 * @param {Object} player Moving player.
 * @param {Object} pendingMove Private pending move state.
 *
 * @returns {void}
 */
function rollbackStagedMove(board, player, pendingMove) {
    pendingMove.move.placements.forEach((placement) => {
        board[placement.row][placement.column].tile = null;
    });

    player.rack = pendingMove.originalRack.slice();
}

/**
 * Commits a staged move by scoring it and replenishing the rack.
 *
 * @param {Array<Object>} bag Mutable tile bag.
 * @param {Object} player Moving player.
 * @param {Object} pendingMove Private pending move state.
 *
 * @returns {Array<Object>} Replacement tiles drawn from the bag.
 */
function commitStagedMove(bag, player, pendingMove) {
    player.score += pendingMove.move.score;

    const replacementTiles = drawTiles(
        bag,
        RACK_SIZE - player.rack.length
    );

    player.rack.push(...replacementTiles);

    return replacementTiles;
}

/**
 * Returns the safe public representation of a pending move.
 *
 * Tile identifiers, private rack snapshots, and trusted tile objects are
 * intentionally excluded.
 *
 * @param {Object|null} pendingMove Private pending move state.
 *
 * @returns {Object|null} Public pending move or null.
 */
function getPublicPendingMove(pendingMove) {
    if (pendingMove === null) {
        return null;
    }

    return {
        playerId: pendingMove.playerId,
        playerName: pendingMove.playerName,
        nextPlayerId: pendingMove.nextPlayerId,
        score: pendingMove.move.score,
        bingoBonus: pendingMove.move.bingoBonus,
        words: pendingMove.move.words.map((word) => ({
            text: word.text,
            score: word.score
        })),
        placements: pendingMove.move.placements.map((placement) => ({
            row: placement.row,
            column: placement.column
        }))
    };
}

module.exports = {
    commitStagedMove,
    getNextPlayerId,
    getPublicPendingMove,
    rollbackStagedMove,
    stageMove
};
