/**
 * Electronic Scrabble persistent game store.
 *
 * Stores private game snapshots as JSON files using an atomic temporary-file
 * rename. Runtime sockets and timers are intentionally excluded.
 *
 * @author Electronic Scrabble Project
 * @version 1.1.0
 */

const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { restoreTurnClock, serializeTurnClock } = require('../game/turn-clock');

const SNAPSHOT_SCHEMA_VERSION = 1;
const GAME_CODE_PATTERN = /^[A-Z2-9]{4}$/;

/**
 * Ensures that a persistence directory exists with private permissions.
 *
 * @param {string} directory Persistence directory.
 *
 * @returns {void}
 */
function ensureDirectory(directory) {
    fs.mkdirSync(directory, {
        recursive: true,
        mode: 0o700
    });

    try {
        fs.chmodSync(directory, 0o700);
    } catch (error) {
        if (process.platform !== 'win32') {
            throw error;
        }
    }
}

/**
 * Returns the snapshot path for a game code.
 *
 * @param {string} directory Persistence directory.
 * @param {string} gameCode Public game code.
 *
 * @returns {string} Snapshot path.
 */
function getGamePath(directory, gameCode) {
    if (!GAME_CODE_PATTERN.test(gameCode)) {
        throw new Error(`Invalid game code for persistence: ${gameCode}.`);
    }

    return path.join(directory, `${gameCode}.json`);
}

/**
 * Converts a runtime game into a serializable private snapshot.
 *
 * @param {Object} game Runtime game.
 * @param {number} now Current Unix timestamp in milliseconds.
 *
 * @returns {Object} Serializable snapshot.
 */
function serializeGame(game, now = Date.now()) {
    return {
        schemaVersion: SNAPSHOT_SCHEMA_VERSION,
        savedAt: now,
        game: {
            code: game.code,
            updatedAt: game.updatedAt ?? now,
            adminToken: game.adminToken,
            status: game.status,
            bag: game.bag,
            board: game.board,
            players: Array.from(game.players.values()).map((player) => ({
                id: player.id,
                token: player.token,
                name: player.name,
                score: player.score,
                rack: player.rack
            })),
            turnOrder: game.turnOrder,
            currentPlayerId: game.currentPlayerId,
            turnNumber: game.turnNumber,
            lastMove: game.lastMove,
            lastAction: game.lastAction,
            pendingMove: game.pendingMove,
            startingPlayerDraw: game.startingPlayerDraw,
            finalResult: game.finalResult,
            stopReason: game.stopReason ?? null,
            stoppedAt: game.stoppedAt ?? null,
            consecutivePasses: game.consecutivePasses,
            turnClock: serializeTurnClock(game.turnClock, now)
        }
    };
}

/**
 * Restores a runtime game from a private snapshot.
 *
 * @param {Object} snapshot Parsed persistent snapshot.
 * @param {number} now Current Unix timestamp in milliseconds.
 *
 * @returns {Object} Restored runtime game.
 */
function restoreGame(snapshot, now = Date.now()) {
    if (snapshot?.schemaVersion !== SNAPSHOT_SCHEMA_VERSION) {
        throw new Error('Unsupported game snapshot schema version.');
    }

    const storedGame = snapshot.game;

    if (!storedGame || !GAME_CODE_PATTERN.test(storedGame.code)) {
        throw new Error('Invalid persistent game snapshot.');
    }

    if (!Array.isArray(storedGame.players)) {
        throw new Error('Persistent game snapshot has no player list.');
    }

    const players = new Map(
        storedGame.players.map((player) => [
            player.id,
            {
                id: player.id,
                token: player.token,
                name: player.name,
                score: player.score,
                rack: player.rack,
                socket: null,
                removalTimer: null
            }
        ])
    );

    return {
        code: storedGame.code,
        adminToken: storedGame.adminToken,
        status: storedGame.status,
        bag: storedGame.bag,
        board: storedGame.board,
        players,
        turnOrder: storedGame.turnOrder,
        currentPlayerId: storedGame.currentPlayerId,
        turnNumber: storedGame.turnNumber,
        lastMove: storedGame.lastMove,
        lastAction: storedGame.lastAction,
        pendingMove: storedGame.pendingMove,
        startingPlayerDraw: storedGame.startingPlayerDraw,
        finalResult: storedGame.finalResult,
        stopReason: storedGame.stopReason ?? null,
        stoppedAt: storedGame.stoppedAt ?? null,
        consecutivePasses: storedGame.consecutivePasses,
        turnClock: restoreTurnClock(storedGame.turnClock, now),
        updatedAt: Number.isFinite(storedGame.updatedAt)
            ? storedGame.updatedAt
            : (Number.isFinite(snapshot.savedAt) ? snapshot.savedAt : now),
        adminSockets: new Set(),
        screenSockets: new Set()
    };
}

/**
 * Creates a file-backed game store.
 *
 * @param {string} directory Persistence directory.
 *
 * @returns {Object} Game-store API.
 */
function createGameStore(directory) {
    const resolvedDirectory = path.resolve(directory);

    ensureDirectory(resolvedDirectory);

    return {
        directory: resolvedDirectory,

        /**
         * Saves one game atomically.
         *
         * @param {Object} game Runtime game.
         * @param {number} now Current Unix timestamp in milliseconds.
         *
         * @returns {string} Written snapshot path.
         */
        saveGame(game, now = Date.now()) {
            const targetPath = getGamePath(resolvedDirectory, game.code);
            const temporaryPath = path.join(
                resolvedDirectory,
                `.${game.code}.${process.pid}.${randomUUID()}.tmp`
            );
            const payload = `${JSON.stringify(serializeGame(game, now), null, 2)}\n`;

            fs.writeFileSync(temporaryPath, payload, {
                encoding: 'utf8',
                mode: 0o600
            });

            fs.renameSync(temporaryPath, targetPath);

            return targetPath;
        },

        /**
         * Loads every valid persisted game.
         *
         * Corrupt snapshots are reported to the caller without preventing
         * other games from loading.
         *
         * @param {number} now Current Unix timestamp in milliseconds.
         *
         * @returns {{games: Array<Object>, errors: Array<Object>}} Load result.
         */
        loadGames(now = Date.now()) {
            const games = [];
            const errors = [];
            const entries = fs.readdirSync(resolvedDirectory, {
                withFileTypes: true
            });

            entries
                .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
                .forEach((entry) => {
                    const snapshotPath = path.join(resolvedDirectory, entry.name);

                    try {
                        const snapshot = JSON.parse(
                            fs.readFileSync(snapshotPath, 'utf8')
                        );

                        games.push(restoreGame(snapshot, now));
                    } catch (error) {
                        errors.push({
                            path: snapshotPath,
                            error
                        });
                    }
                });

            return {
                games,
                errors
            };
        }
    };
}

module.exports = {
    SNAPSHOT_SCHEMA_VERSION,
    createGameStore,
    restoreGame,
    serializeGame
};
