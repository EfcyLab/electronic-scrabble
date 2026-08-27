/**
 * Electronic Scrabble game lifecycle tests.
 *
 * @author Electronic Scrabble Project
 * @version 1.0.0
 */

const assert = require('node:assert/strict');
const test = require('node:test');
const { createBoard } = require('../game/board');
const { createTurnClock, resumeTurnClock } = require('../game/turn-clock');
const { resumeStoppedGame, stopGame } = require('../game/game-lifecycle');

/**
 * Creates a minimal runtime game for lifecycle testing.
 *
 * @returns {Object} Test game.
 */
function createGame() {
    return {
        status: 'playing',
        board: createBoard(),
        players: new Map(),
        currentPlayerId: 'P1',
        pendingMove: null,
        turnClock: createTurnClock({ mode: 'elapsed' }),
        stopReason: null,
        stoppedAt: null,
        stoppedState: null
    };
}

test('administrator stop marks an active game as stopped and pauses the clock', () => {
    const game = createGame();

    resumeTurnClock(game.turnClock, 1000);
    stopGame(game, 4000);

    assert.equal(game.status, 'stopped');
    assert.equal(game.currentPlayerId, null);
    assert.equal(game.stopReason, 'administrator');
    assert.equal(game.stoppedAt, 4000);
    assert.equal(game.turnClock.startedAt, null);
    assert.equal(game.turnClock.elapsedMs, 3000);
});

test('administrator stop rolls back a provisional challenge move', () => {
    const game = createGame();
    const originalTile = {
        id: 'T1',
        letter: 'A',
        value: 1,
        isBlank: false
    };
    const player = {
        id: 'P1',
        rack: []
    };

    game.players.set(player.id, player);
    game.board[7][7].tile = { ...originalTile };
    game.pendingMove = {
        playerId: player.id,
        originalRack: [originalTile],
        move: {
            placements: [{
                row: 7,
                column: 7,
                tile: originalTile
            }]
        }
    };

    stopGame(game, 5000);

    assert.equal(game.board[7][7].tile, null);
    assert.deepEqual(player.rack, [originalTile]);
    assert.equal(game.pendingMove, null);
});

test('administrator stop rejects terminal games', () => {
    const game = createGame();

    game.status = 'finished';

    assert.throws(
        () => stopGame(game),
        (error) => error.code === 'GAME_NOT_ACTIVE'
    );
});


test('stopped playing game can resume with the same current player and clock', () => {
    const game = createGame();

    resumeTurnClock(game.turnClock, 1000);
    stopGame(game, 4000);
    resumeStoppedGame(game, 10000);

    assert.equal(game.status, 'playing');
    assert.equal(game.currentPlayerId, 'P1');
    assert.equal(game.stopReason, null);
    assert.equal(game.stoppedAt, null);
    assert.equal(game.stoppedState, null);
    assert.equal(game.turnClock.elapsedMs, 3000);
    assert.equal(game.turnClock.startedAt, 10000);
});

test('stopped lobby resumes as a lobby without a current player', () => {
    const game = createGame();

    game.status = 'lobby';
    game.currentPlayerId = null;
    stopGame(game, 4000);
    resumeStoppedGame(game, 10000);

    assert.equal(game.status, 'lobby');
    assert.equal(game.currentPlayerId, null);
    assert.equal(game.turnClock.startedAt, null);
});

test('resume rejects a game that is not stopped', () => {
    const game = createGame();

    assert.throws(
        () => resumeStoppedGame(game),
        (error) => error.code === 'GAME_NOT_RESUMABLE'
    );
});
