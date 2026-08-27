/**
 * Electronic Scrabble persistent game store tests.
 *
 * @author Electronic Scrabble Project
 * @version 1.0.0
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createBoard } = require('../game/board');
const { createTurnClock, resetTurnClock } = require('../game/turn-clock');
const {
    createGameStore,
    restoreGame,
    serializeGame
} = require('../persistence/game-store');

/**
 * Creates a representative runtime game fixture.
 *
 * @returns {Object} Runtime game.
 */
function createGameFixture() {
    const turnClock = createTurnClock();

    resetTurnClock(turnClock, 1000);

    return {
        code: 'ABCD',
        createdAt: 500,
        updatedAt: 1000,
        adminToken: 'admin-secret',
        status: 'playing',
        bag: [{ id: 'bag-1', letter: 'A', value: 1, isBlank: false }],
        board: createBoard(),
        players: new Map([
            ['p1', {
                id: 'p1',
                token: 'player-secret',
                name: 'Alice',
                score: 42,
                rack: [{ id: 'rack-1', letter: 'B', value: 3, isBlank: false }],
                socket: { runtimeOnly: true },
                removalTimer: { runtimeOnly: true }
            }]
        ]),
        turnOrder: ['p1'],
        currentPlayerId: 'p1',
        turnNumber: 4,
        lastMove: null,
        lastAction: null,
        pendingMove: null,
        startingPlayerDraw: null,
        finalResult: null,
        stopReason: null,
        stoppedAt: null,
        stoppedState: null,
        consecutivePasses: 0,
        turnClock,
        adminSockets: new Set([{ runtimeOnly: true }]),
        screenSockets: new Set([{ runtimeOnly: true }])
    };
}

test('serialized game retains private game data but excludes runtime sockets', () => {
    const snapshot = serializeGame(createGameFixture(), 6000);
    const json = JSON.stringify(snapshot);

    assert.match(json, /admin-secret/);
    assert.match(json, /player-secret/);
    assert.match(json, /rack-1/);
    assert.doesNotMatch(json, /runtimeOnly/);
});

test('restored game rebuilds maps and disconnected runtime state', () => {
    const snapshot = serializeGame(createGameFixture(), 6000);
    const restored = restoreGame(snapshot, 100000);
    const player = restored.players.get('p1');

    assert.ok(restored.players instanceof Map);
    assert.ok(restored.adminSockets instanceof Set);
    assert.ok(restored.screenSockets instanceof Set);
    assert.equal(player.socket, null);
    assert.equal(player.removalTimer, null);
    assert.equal(player.token, 'player-secret');
    assert.equal(restored.turnClock.startedAt, 100000);
});

test('file store persists and reloads a complete game', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'electronic-scrabble-'));
    const store = createGameStore(directory);

    store.saveGame(createGameFixture(), 6000);

    const result = store.loadGames(100000);

    assert.equal(result.errors.length, 0);
    assert.equal(result.games.length, 1);
    assert.equal(result.games[0].code, 'ABCD');
    assert.equal(result.games[0].players.get('p1').score, 42);

    fs.rmSync(directory, { recursive: true, force: true });
});

test('file store reports corrupt snapshots without blocking valid games', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'electronic-scrabble-'));
    const store = createGameStore(directory);

    store.saveGame(createGameFixture(), 6000);
    fs.writeFileSync(path.join(directory, 'WXYZ.json'), '{broken', 'utf8');

    const result = store.loadGames(100000);

    assert.equal(result.games.length, 1);
    assert.equal(result.errors.length, 1);

    fs.rmSync(directory, { recursive: true, force: true });
});


test('file store deletes a persisted game snapshot', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'electronic-scrabble-'));
    const store = createGameStore(directory);

    store.saveGame(createGameFixture(), 6000);
    assert.equal(fs.existsSync(path.join(directory, 'ABCD.json')), true);
    assert.equal(store.deleteGame('ABCD'), true);
    assert.equal(fs.existsSync(path.join(directory, 'ABCD.json')), false);
    assert.equal(store.deleteGame('ABCD'), false);

    fs.rmSync(directory, { recursive: true, force: true });
});

test('persistent snapshots retain stopped-game resume metadata', () => {
    const game = createGameFixture();

    game.status = 'stopped';
    game.currentPlayerId = null;
    game.stoppedState = {
        status: 'playing',
        currentPlayerId: 'p1'
    };

    const restored = restoreGame(serializeGame(game, 6000), 10000);

    assert.deepEqual(restored.stoppedState, {
        status: 'playing',
        currentPlayerId: 'p1'
    });
    assert.equal(restored.createdAt, 500);
});
