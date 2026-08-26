/**
 * Electronic Scrabble game lifecycle utilities.
 *
 * Handles administrator-driven game termination without applying end-game
 * scoring. A stopped game remains persistable and reviewable but cannot
 * accept further gameplay actions.
 *
 * @author Electronic Scrabble Project
 * @version 1.0.0
 */

const { rollbackStagedMove } = require('./challenge-engine');
const { pauseTurnClock } = require('./turn-clock');

const ACTIVE_GAME_STATUSES = new Set([
    'lobby',
    'starting',
    'playing'
]);

/**
 * Stops an active game while preserving its current committed state.
 *
 * Any provisional challenged move is rolled back before the game is stopped,
 * because it has not yet become part of the committed game state.
 *
 * @param {Object} game Mutable game state.
 * @param {number} now Stop timestamp.
 *
 * @returns {Object} Updated game state.
 *
 * @throws {Error} When the game is already terminal.
 */
function stopGame(game, now = Date.now()) {
    if (!ACTIVE_GAME_STATUSES.has(game.status)) {
        const error = new Error('The game is no longer active.');

        error.code = 'GAME_NOT_ACTIVE';
        throw error;
    }

    if (game.pendingMove !== null) {
        const movingPlayer = game.players.get(game.pendingMove.playerId);

        if (movingPlayer) {
            rollbackStagedMove(game.board, movingPlayer, game.pendingMove);
        }

        game.pendingMove = null;
    }

    pauseTurnClock(game.turnClock, now);

    game.status = 'stopped';
    game.currentPlayerId = null;
    game.stopReason = 'administrator';
    game.stoppedAt = now;

    return game;
}

module.exports = {
    ACTIVE_GAME_STATUSES,
    stopGame
};
