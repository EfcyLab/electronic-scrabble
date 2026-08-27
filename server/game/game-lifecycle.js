/**
 * Electronic Scrabble game lifecycle utilities.
 *
 * Handles administrator-driven suspension and resumption without applying
 * end-game scoring. Stopped games remain persistent and can be resumed later.
 *
 * @author Electronic Scrabble Project
 * @version 2.0.0
 */

const { rollbackStagedMove } = require('./challenge-engine');
const { pauseTurnClock, resumeTurnClock } = require('./turn-clock');

const ACTIVE_GAME_STATUSES = new Set([
    'lobby',
    'starting',
    'playing'
]);

/**
 * Stops an active game while preserving enough state to resume it later.
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

    const previousStatus = game.status;
    const previousCurrentPlayerId = game.currentPlayerId;

    if (game.pendingMove !== null) {
        const movingPlayer = game.players.get(game.pendingMove.playerId);

        if (movingPlayer) {
            rollbackStagedMove(game.board, movingPlayer, game.pendingMove);
        }

        game.pendingMove = null;
    }

    pauseTurnClock(game.turnClock, now);

    game.stoppedState = {
        status: previousStatus,
        currentPlayerId: previousCurrentPlayerId
    };
    game.status = 'stopped';
    game.currentPlayerId = null;
    game.stopReason = 'administrator';
    game.stoppedAt = now;

    return game;
}

/**
 * Resumes a game previously stopped by an administrator.
 *
 * @param {Object} game Mutable game state.
 * @param {number} now Resume timestamp.
 *
 * @returns {Object} Updated game state.
 *
 * @throws {Error} When the game is not resumable.
 */
function resumeStoppedGame(game, now = Date.now()) {
    if (game.status !== 'stopped' || !game.stoppedState) {
        const error = new Error('The game is not a resumable stopped game.');

        error.code = 'GAME_NOT_RESUMABLE';
        throw error;
    }

    const restoredStatus = ACTIVE_GAME_STATUSES.has(game.stoppedState.status)
        ? game.stoppedState.status
        : 'lobby';

    game.status = restoredStatus;
    game.currentPlayerId = restoredStatus === 'playing'
        ? game.stoppedState.currentPlayerId
        : null;
    game.stopReason = null;
    game.stoppedAt = null;
    game.stoppedState = null;

    if (restoredStatus === 'playing' && game.currentPlayerId !== null) {
        resumeTurnClock(game.turnClock, now);
    }

    return game;
}

module.exports = {
    ACTIVE_GAME_STATUSES,
    resumeStoppedGame,
    stopGame
};
