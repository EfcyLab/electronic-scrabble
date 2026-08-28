/**
 * Electronic Scrabble WebSocket Server
 *
 * Manages game sessions, lobby synchronization, player reconnection,
 * game startup, private racks, turn order, and validated board moves.
 *
 * The server is the authoritative source of the game state.
 *
 * @author Electronic Scrabble Project
 * @version 1.4.0
 */

const WebSocket = require('ws');
const { randomInt, randomUUID } = require('node:crypto');
const path = require('node:path');
const os = require('node:os');
const {
    RACK_SIZE,
    createFrenchTileBag,
    drawTiles
} = require('./game/french-tiles');
const {
    createBoard,
    getPublicBoardState
} = require('./game/board');
const {
    MoveValidationError,
    applyMove,
    validateAndScoreMove
} = require('./game/move-engine');
const {
    TurnActionError,
    exchangeTiles
} = require('./game/turn-actions');
const {
    END_REASON_CONSECUTIVE_PASSES,
    END_REASON_RACK_EMPTIED,
    finishGame,
    shouldEndAfterConsecutivePasses,
    shouldEndAfterRackEmptied
} = require('./game/end-game');
const {
    determineStartingPlayer,
    rotateTurnOrder
} = require('./game/starting-player');
const {
    FfscWordCheckUnavailableError,
    WordValidationError,
    validateMoveWordsAsync
} = require('./game/word-validator');
const {
    WordValidationConfigurationError,
    createWordValidationRegistry
} = require('./game/word-validation-registry');
const {
    commitStagedMove,
    getNextPlayerId,
    getPublicPendingMove,
    rollbackStagedMove,
    stageMove
} = require('./game/challenge-engine');
const {
    applyUnsuccessfulChallengePenalty
} = require('./game/challenge-rules');
const {
    CLOCK_MODE_COUNTDOWN,
    CLOCK_MODE_ELAPSED,
    CLOCK_MODE_OFF,
    configureTurnClock,
    createTurnClock,
    getPublicTurnClock,
    pauseTurnClock,
    resetTurnClock
} = require('./game/turn-clock');
const { createGameStore } = require('./persistence/game-store');
const {
    resumeStoppedGame: resumeStoppedGameState,
    stopGame: stopGameState
} = require('./game/game-lifecycle');
const {
    ACTION_POWEROFF,
    ACTION_REBOOT,
    executeConsoleAction,
    isConsoleControlEnabled,
    validateConsoleAction
} = require('./system/console-control');

const PORT = 8080;
const MIN_PLAYERS = 2;
const MAX_PLAYERS = 4;
const GAME_CODE_LENGTH = 4;
const GAME_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const LOBBY_RECONNECT_GRACE_MS = 30000;
const PERSISTENCE_INTERVAL_MS = 10000;
const DEFAULT_DATA_DIRECTORY = path.join(
    os.homedir(),
    '.local',
    'share',
    'electronic-scrabble',
    'games'
);

const wordValidationRegistry = createWordValidationRegistry(process.env);
const consoleControlEnabled = isConsoleControlEnabled();
let consoleSystemActionPending = false;
const consoleScreenSockets = new Set();

const games = new Map();
const wordValidationLocks = new Set();
const WORD_VALIDATION_LOCKED_MESSAGE_TYPES = new Set([
    'submit-move',
    'accept-pending-move',
    'challenge-pending-move',
    'pass-turn',
    'exchange-tiles',
    'stop-game'
]);
const gameStore = createGameStore(
    process.env.ELECTRONIC_SCRABBLE_DATA_DIR || DEFAULT_DATA_DIRECTORY
);

const restoredGames = gameStore.loadGames();

restoredGames.games.forEach((game) => {
    game.createdAt = game.createdAt ?? game.updatedAt ?? Date.now();
    game.updatedAt = game.updatedAt ?? Date.now();
    game.wordValidationConfig = wordValidationRegistry.restoreConfiguration(
        game.wordValidationConfig
    );
    games.set(game.code, game);
});

restoredGames.errors.forEach(({ path: snapshotPath, error }) => {
    console.error(`Unable to restore persisted game ${snapshotPath}:`, error);
});

const server = new WebSocket.WebSocketServer({
    port: PORT
});

/**
 * Sends a JSON message to a WebSocket client.
 *
 * @param {WebSocket} socket Target WebSocket connection.
 * @param {string} type Message type.
 * @param {Object} payload Message payload.
 *
 * @returns {void}
 */
function send(socket, type, payload = {}) {
    if (socket.readyState !== WebSocket.OPEN) {
        return;
    }

    socket.send(JSON.stringify({
        type,
        ...payload
    }));
}

/**
 * Sends an error message to a WebSocket client.
 *
 * @param {WebSocket} socket Target WebSocket connection.
 * @param {string} code Error code.
 * @param {string} message Human-readable error message.
 *
 * @returns {void}
 */
function sendError(socket, code, message, details = {}) {
    send(socket, 'error', {
        code,
        message,
        ...details
    });
}

/**
 * Generates a unique public game code.
 *
 * @returns {string} Generated game code.
 */
function generateGameCode() {
    let code;

    do {
        code = '';

        for (let index = 0; index < GAME_CODE_LENGTH; index += 1) {
            code += GAME_CODE_ALPHABET[randomInt(GAME_CODE_ALPHABET.length)];
        }
    } while (games.has(code));

    return code;
}

/**
 * Returns a game using its public code.
 *
 * @param {string} gameCode Public game code.
 *
 * @returns {Object|null} Game instance or null when not found.
 */
function getGame(gameCode) {
    if (typeof gameCode !== 'string') {
        return null;
    }

    return games.get(gameCode.trim().toUpperCase()) ?? null;
}

/**
 * Persists the complete private state of a game.
 *
 * Persistence failures are logged without stopping the active game. The
 * next state change or periodic snapshot will retry the write.
 *
 * @param {Object} game Runtime game.
 *
 * @returns {void}
 */
function persistGame(game, { touch = true } = {}) {
    try {
        if (touch) {
            game.updatedAt = Date.now();
        }

        gameStore.saveGame(game);
    } catch (error) {
        console.error(`Unable to persist game ${game.code}:`, error);
    }
}

/**
 * Persists every known game without changing console-selection recency.
 *
 * @returns {void}
 */
function persistAllGames() {
    games.forEach((game) => {
        persistGame(game, { touch: false });
    });
}

/**
 * Returns the public representation of a game.
 *
 * Private racks and player authentication tokens are intentionally excluded.
 *
 * @param {Object} game Game instance.
 *
 * @returns {Object} Public game state.
 */
function getPublicGameState(game) {
    return {
        code: game.code,
        status: game.status,
        createdAt: game.createdAt ?? null,
        updatedAt: game.updatedAt ?? null,
        bagRemaining: game.status === 'lobby' ? null : game.bag.length,
        board: getPublicBoardState(game.board),
        currentPlayerId: game.currentPlayerId,
        turnNumber: game.turnNumber,
        lastMove: game.lastMove,
        lastAction: game.lastAction,
        pendingMove: getPublicPendingMove(game.pendingMove),
        startingPlayerDraw: game.startingPlayerDraw,
        finalResult: game.finalResult,
        stopReason: game.stopReason ?? null,
        stoppedAt: game.stoppedAt ?? null,
        resumable: game.status === 'stopped' && game.stoppedState !== null,
        turnClock: getPublicTurnClock(game.turnClock),
        wordValidation: wordValidationRegistry.getPublicState(
            game.wordValidationConfig
        ),
        players: Array.from(game.players.values()).map((player) => ({
            id: player.id,
            name: player.name,
            score: player.score,
            rackCount: player.rack.length,
            connected: player.socket !== null
        }))
    };
}

/**
 * Returns a safe management summary for an administrator-owned game.
 *
 * @param {Object} game Runtime game.
 *
 * @returns {Object} Public management summary.
 */
function getManagedGameSummary(game) {
    return {
        code: game.code,
        status: game.status,
        createdAt: game.createdAt ?? null,
        updatedAt: game.updatedAt ?? null,
        stoppedAt: game.stoppedAt ?? null,
        resumable: game.status === 'stopped' && game.stoppedState !== null,
        turnNumber: game.turnNumber,
        playerCount: game.players.size,
        players: Array.from(game.players.values()).map((player) => ({
            name: player.name,
            score: player.score
        })),
        winnerNames: game.finalResult?.rankings
            ?.filter((ranking) => game.finalResult.winnerIds.includes(ranking.playerId))
            .map((ranking) => ranking.playerName) ?? []
    };
}

/**
 * Sends the game history entries authorized by locally stored admin tokens.
 *
 * @param {WebSocket} socket Requesting WebSocket connection.
 * @param {Object} message Protocol message.
 *
 * @returns {void}
 */
function listManagedGames(socket, message) {
    const requestedSessions = Array.isArray(message.sessions)
        ? message.sessions.slice(0, 100)
        : [];
    const summaries = [];

    requestedSessions.forEach((session) => {
        const game = getGame(session?.gameCode);
        const adminToken = typeof session?.adminToken === 'string'
            ? session.adminToken.trim()
            : '';

        if (!game || !adminToken || adminToken !== game.adminToken) {
            return;
        }

        summaries.push(getManagedGameSummary(game));
    });

    summaries.sort(
        (left, right) => (right.updatedAt ?? 0) - (left.updatedAt ?? 0)
    );

    send(socket, 'managed-games', {
        games: summaries
    });
}

/**
 * Refreshes every dedicated console screen after game selection changes.
 *
 * @returns {void}
 */
function refreshConsoleScreens() {
    const game = getConsoleGame();

    consoleScreenSockets.forEach((socket) => {
        if (!game) {
            socket.session = {
                role: 'console-screen',
                gameCode: null
            };
            send(socket, 'console-idle');
            return;
        }

        socket.session = {
            role: 'console-screen',
            gameCode: game.code
        };
        send(socket, 'console-game-selected', {
            gameCode: game.code
        });
        send(socket, 'game-state', {
            game: getPublicGameState(game)
        });
    });
}

/**
 * Purges a finished or stopped game owned by an administrator token.
 *
 * @param {WebSocket} socket Requesting WebSocket connection.
 * @param {Object} message Protocol message.
 *
 * @returns {void}
 */
function purgeManagedGame(socket, message) {
    const game = getGame(message.gameCode);
    const adminToken = typeof message.adminToken === 'string'
        ? message.adminToken.trim()
        : '';

    if (!game) {
        sendError(socket, 'GAME_NOT_FOUND', 'The requested game does not exist.');
        return;
    }

    if (!adminToken || adminToken !== game.adminToken) {
        sendError(socket, 'NOT_AUTHORIZED', 'The administrator token is invalid.');
        return;
    }

    if (!['finished', 'stopped'].includes(game.status)) {
        sendError(socket, 'GAME_PURGE_FORBIDDEN', 'Only finished or stopped games can be purged.');
        return;
    }

    try {
        gameStore.deleteGame(game.code);
    } catch (error) {
        console.error(`Unable to purge persisted game ${game.code}:`, error);
        sendError(socket, 'GAME_PURGE_FAILED', 'The persistent game snapshot could not be deleted.');
        return;
    }

    const affectedSockets = getGameSockets(game);

    affectedSockets.forEach((participantSocket) => {
        send(participantSocket, 'game-purged', {
            gameCode: game.code
        });
        participantSocket.session = null;
    });

    game.players.forEach((player) => {
        player.socket = null;
    });
    game.adminSockets.clear();
    game.screenSockets.clear();
    games.delete(game.code);

    refreshConsoleScreens();
    send(socket, 'game-purged', {
        gameCode: game.code
    });
    console.log(`Game ${game.code} purged by administrator.`);
}

/**
 * Returns all sockets currently associated with a game.
 *
 * @param {Object} game Game instance.
 *
 * @returns {Set<WebSocket>} Connected game sockets.
 */
function getGameSockets(game) {
    const sockets = new Set();

    game.adminSockets.forEach((socket) => {
        sockets.add(socket);
    });

    game.screenSockets.forEach((socket) => {
        sockets.add(socket);
    });

    consoleScreenSockets.forEach((socket) => {
        if (socket.session?.gameCode === game.code) {
            sockets.add(socket);
        }
    });

    game.players.forEach((player) => {
        if (player.socket !== null) {
            sockets.add(player.socket);
        }
    });

    return sockets;
}

/**
 * Returns the most recently updated game for the dedicated console screen.
 *
 * Active games are preferred over finished games. This allows the HDMI
 * display to recover automatically after a reboot without a fixed game code.
 *
 * @returns {Object|null} Selected game or null when no game exists.
 */
function getConsoleGame() {
    const allGames = Array.from(games.values());

    if (allGames.length === 0) {
        return null;
    }

    const activeGames = allGames.filter(
        (game) => ['lobby', 'starting', 'playing'].includes(game.status)
    );

    if (activeGames.length > 0) {
        return activeGames.sort(
            (left, right) => (right.updatedAt ?? 0) - (left.updatedAt ?? 0)
        )[0] ?? null;
    }

    const finishedGames = allGames.filter((game) => game.status === 'finished');

    return finishedGames.sort(
        (left, right) => (right.updatedAt ?? 0) - (left.updatedAt ?? 0)
    )[0] ?? null;
}

/**
 * Selects a game for every dedicated console screen.
 *
 * @param {Object} game Game to display.
 *
 * @returns {void}
 */
function selectGameForConsoleScreens(game) {
    const gameState = getPublicGameState(game);

    consoleScreenSockets.forEach((socket) => {
        socket.session = {
            role: 'console-screen',
            gameCode: game.code
        };

        send(socket, 'console-game-selected', {
            gameCode: game.code
        });
        send(socket, 'game-state', {
            game: gameState
        });
    });
}

/**
 * Broadcasts the public game state to every connected participant.
 *
 * @param {Object} game Game instance.
 *
 * @returns {void}
 */
function broadcastGameState(game) {
    persistGame(game);

    const gameState = getPublicGameState(game);

    getGameSockets(game).forEach((socket) => {
        send(socket, 'game-state', {
            game: gameState
        });
    });
}

/**
 * Sends a player's private state only to that player's active socket.
 *
 * @param {Object} game Game instance.
 * @param {Object} player Player instance.
 *
 * @returns {void}
 */
function sendPrivatePlayerState(game, player) {
    if (player.socket === null) {
        return;
    }

    send(player.socket, 'player-state', {
        gameCode: game.code,
        player: {
            id: player.id,
            name: player.name,
            score: player.score,
            rack: player.rack,
            isCurrentPlayer: game.currentPlayerId === player.id
        }
    });
}

/**
 * Sends every connected player their own private state.
 *
 * @param {Object} game Game instance.
 *
 * @returns {void}
 */
function sendAllPrivatePlayerStates(game) {
    game.players.forEach((player) => {
        sendPrivatePlayerState(game, player);
    });
}

/**
 * Cancels a pending lobby removal timer for a player.
 *
 * @param {Object} player Player instance.
 *
 * @returns {void}
 */
function cancelPlayerRemoval(player) {
    if (player.removalTimer === null) {
        return;
    }

    clearTimeout(player.removalTimer);
    player.removalTimer = null;
}

/**
 * Schedules removal of a disconnected lobby player.
 *
 * Players are retained during active games so they can reconnect later.
 *
 * @param {Object} game Game instance.
 * @param {Object} player Player instance.
 *
 * @returns {void}
 */
function schedulePlayerRemoval(game, player) {
    cancelPlayerRemoval(player);

    if (game.status !== 'lobby') {
        return;
    }

    player.removalTimer = setTimeout(() => {
        if (player.socket !== null || game.status !== 'lobby') {
            return;
        }

        game.players.delete(player.id);
        broadcastGameState(game);

        console.log(
            `Player "${player.name}" removed from lobby ${game.code} after disconnect timeout.`
        );
    }, LOBBY_RECONNECT_GRACE_MS);
}

/**
 * Detaches a socket from its current game session.
 *
 * @param {WebSocket} socket WebSocket connection.
 *
 * @returns {void}
 */
function detachSocket(socket) {
    const session = socket.session;

    if (!session) {
        return;
    }

    if (session.role === 'console-screen') {
        consoleScreenSockets.delete(socket);
        socket.session = null;
        return;
    }

    if (!session.gameCode) {
        socket.session = null;
        return;
    }

    const game = games.get(session.gameCode);

    if (!game) {
        socket.session = null;
        return;
    }

    if (session.role === 'admin') {
        game.adminSockets.delete(socket);
    }

    if (session.role === 'screen') {
        game.screenSockets.delete(socket);
    }


    if (session.role === 'player' && session.playerId) {
        const player = game.players.get(session.playerId);

        if (player && player.socket === socket) {
            player.socket = null;
            schedulePlayerRemoval(game, player);
        }
    }

    socket.session = null;

    broadcastGameState(game);
}

/**
 * Creates a new game session.
 *
 * @param {WebSocket} socket Administrator WebSocket connection.
 *
 * @returns {void}
 */
function createGame(socket, message = {}) {
    let wordValidationConfig;

    try {
        wordValidationConfig = wordValidationRegistry.normalizeConfiguration({
            provider: message.wordValidationProvider,
            policy: message.wordValidationPolicy
        });
    } catch (error) {
        if (error instanceof WordValidationConfigurationError) {
            sendError(socket, error.code, error.message);
            return;
        }

        throw error;
    }

    detachSocket(socket);

    const gameCode = generateGameCode();

    const game = {
        code: gameCode,
        adminToken: randomUUID(),
        status: 'lobby',
        bag: [],
        board: createBoard(),
        players: new Map(),
        turnOrder: [],
        currentPlayerId: null,
        turnNumber: 0,
        lastMove: null,
        lastAction: null,
        pendingMove: null,
        startingPlayerDraw: null,
        finalResult: null,
        stopReason: null,
        stoppedAt: null,
        stoppedState: null,
        consecutivePasses: 0,
        turnClock: createTurnClock(),
        wordValidationConfig,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        adminSockets: new Set(),
        screenSockets: new Set()
    };

    game.adminSockets.add(socket);
    games.set(gameCode, game);

    socket.session = {
        role: 'admin',
        gameCode
    };

    send(socket, 'game-created', {
        gameCode,
        adminToken: game.adminToken
    });

    broadcastGameState(game);
    selectGameForConsoleScreens(game);
    sendConsoleControlState(socket);

    console.log(`Game created: ${gameCode}`);
}

/**
 * Registers a shared screen for a game.
 *
 * @param {WebSocket} socket Shared screen WebSocket connection.
 * @param {Object} message Received protocol message.
 *
 * @returns {void}
 */
/**
 * Restores a previously authenticated administrator session.
 *
 * @param {WebSocket} socket Administrator WebSocket connection.
 * @param {Object} message Received protocol message.
 *
 * @returns {void}
 */
function resumeAdmin(socket, message) {
    const game = getGame(message.gameCode);

    if (!game) {
        sendError(socket, 'GAME_NOT_FOUND', 'The requested game does not exist.');
        return;
    }

    const adminToken = typeof message.adminToken === 'string'
        ? message.adminToken.trim()
        : '';

    if (!adminToken || adminToken !== game.adminToken) {
        sendError(
            socket,
            'ADMIN_SESSION_NOT_FOUND',
            'The saved administrator session is no longer available.'
        );
        return;
    }

    detachSocket(socket);
    game.adminSockets.add(socket);

    socket.session = {
        role: 'admin',
        gameCode: game.code
    };

    send(socket, 'admin-session-resumed', {
        gameCode: game.code
    });

    broadcastGameState(game);
    sendConsoleControlState(socket);

    console.log(`Administrator resumed game ${game.code}`);
}

/**
 * Configures the turn clock before play begins.
 *
 * @param {WebSocket} socket Administrator WebSocket connection.
 * @param {Object} message Received protocol message.
 *
 * @returns {void}
 */
function configureGameClock(socket, message) {
    const session = socket.session;

    if (!session || session.role !== 'admin' || !session.gameCode) {
        sendError(socket, 'NOT_AUTHORIZED', 'Only a game administrator can configure the clock.');
        return;
    }

    const game = games.get(session.gameCode);

    if (!game) {
        sendError(socket, 'GAME_NOT_FOUND', 'The game does not exist.');
        return;
    }

    if (!['lobby', 'starting'].includes(game.status)) {
        sendError(socket, 'CLOCK_CONFIGURATION_LOCKED', 'The turn clock cannot be changed after play begins.');
        return;
    }

    const mode = typeof message.mode === 'string'
        ? message.mode.trim().toLowerCase()
        : '';

    const supportedModes = new Set([
        CLOCK_MODE_OFF,
        CLOCK_MODE_ELAPSED,
        CLOCK_MODE_COUNTDOWN
    ]);

    if (!supportedModes.has(mode)) {
        sendError(socket, 'INVALID_CLOCK_MODE', 'The requested turn clock mode is not supported.');
        return;
    }

    configureTurnClock(
        game.turnClock,
        mode,
        message.durationSeconds
    );

    broadcastGameState(game);
}

/**
 * Configures word validation for a lobby game.
 *
 * Validation settings are locked once the starting-player draw begins so a
 * game cannot silently switch dictionaries or policies during play.
 *
 * @param {WebSocket} socket Administrator WebSocket connection.
 * @param {Object} message Received protocol message.
 *
 * @returns {void}
 */
function configureGameWordValidation(socket, message) {
    const session = socket.session;

    if (!session || session.role !== 'admin' || !session.gameCode) {
        sendError(
            socket,
            'NOT_AUTHORIZED',
            'Only a game administrator can configure word validation.'
        );
        return;
    }

    const game = games.get(session.gameCode);

    if (!game) {
        sendError(socket, 'GAME_NOT_FOUND', 'The game does not exist.');
        return;
    }

    if (game.status !== 'lobby') {
        sendError(
            socket,
            'VALIDATION_CONFIGURATION_LOCKED',
            'Word validation cannot be changed after the lobby.'
        );
        return;
    }

    try {
        game.wordValidationConfig = wordValidationRegistry.normalizeConfiguration({
            provider: message.provider,
            policy: message.policy
        });
    } catch (error) {
        if (error instanceof WordValidationConfigurationError) {
            sendError(socket, error.code, error.message);
            return;
        }

        throw error;
    }

    broadcastGameState(game);
}

/**
 * Sends console-control capability state to an authenticated administrator.
 *
 * @param {WebSocket} socket Administrator WebSocket connection.
 *
 * @returns {void}
 */
function sendConsoleControlState(socket) {
    send(socket, 'console-control-state', {
        enabled: consoleControlEnabled,
        busy: consoleSystemActionPending
    });
}

/**
 * Registers the dedicated Raspberry Pi HDMI screen.
 *
 * The console screen follows the most recently updated active game and does
 * not require a game code in its URL.
 *
 * @param {WebSocket} socket Shared screen WebSocket connection.
 *
 * @returns {void}
 */
function watchConsole(socket) {
    detachSocket(socket);
    consoleScreenSockets.add(socket);

    const game = getConsoleGame();

    socket.session = {
        role: 'console-screen',
        gameCode: game?.code ?? null
    };

    if (!game) {
        send(socket, 'console-idle');
        console.log('Dedicated console screen connected; waiting for a game.');
        return;
    }

    send(socket, 'console-game-selected', {
        gameCode: game.code
    });
    send(socket, 'game-state', {
        game: getPublicGameState(game)
    });

    console.log(`Dedicated console screen displaying game: ${game.code}`);
}

/**
 * Stops the current game from an authenticated administrator session.
 *
 * The game is preserved as a terminal stopped state without applying final
 * scoring. Any provisional challenged move is rolled back first.
 *
 * @param {WebSocket} socket Administrator WebSocket connection.
 *
 * @returns {void}
 */
function stopGame(socket) {
    const session = socket.session;

    if (!session || session.role !== 'admin' || !session.gameCode) {
        sendError(socket, 'NOT_AUTHORIZED', 'Only a game administrator can stop the game.');
        return;
    }

    const game = games.get(session.gameCode);

    if (!game) {
        sendError(socket, 'GAME_NOT_FOUND', 'The game does not exist.');
        return;
    }

    try {
        stopGameState(game);
    } catch (error) {
        sendError(
            socket,
            error.code || 'GAME_NOT_ACTIVE',
            error.message || 'The game is no longer active.'
        );
        return;
    }

    getGameSockets(game).forEach((participantSocket) => {
        send(participantSocket, 'game-stopped', {
            gameCode: game.code,
            reason: game.stopReason
        });
    });

    broadcastGameState(game);

    consoleScreenSockets.forEach((consoleSocket) => {
        if (consoleSocket.session?.gameCode !== game.code) {
            return;
        }

        consoleSocket.session = {
            role: 'console-screen',
            gameCode: null
        };
        send(consoleSocket, 'console-idle');
    });

    console.log(`Game ${game.code} stopped by administrator.`);
}

/**
 * Resumes the current stopped game from an authenticated administrator.
 *
 * @param {WebSocket} socket Administrator WebSocket connection.
 *
 * @returns {void}
 */
function resumeStoppedGame(socket) {
    const session = socket.session;

    if (!session || session.role !== 'admin' || !session.gameCode) {
        sendError(socket, 'NOT_AUTHORIZED', 'Only a game administrator can resume the game.');
        return;
    }

    const game = games.get(session.gameCode);

    if (!game) {
        sendError(socket, 'GAME_NOT_FOUND', 'The game does not exist.');
        return;
    }

    try {
        resumeStoppedGameState(game);
    } catch (error) {
        sendError(
            socket,
            error.code || 'GAME_NOT_RESUMABLE',
            error.message || 'The game cannot be resumed.'
        );
        return;
    }

    broadcastGameState(game);
    sendAllPrivatePlayerStates(game);
    selectGameForConsoleScreens(game);
    send(socket, 'game-resumed', {
        gameCode: game.code
    });

    console.log(`Game ${game.code} resumed by administrator.`);
}

/**
 * Requests a Raspberry Pi reboot or power-off from an authenticated admin.
 *
 * @param {WebSocket} socket Administrator WebSocket connection.
 * @param {Object} message Received protocol message.
 *
 * @returns {void}
 */
function requestConsoleSystemAction(socket, message) {
    const session = socket.session;

    if (!session || session.role !== 'admin' || !session.gameCode) {
        sendError(socket, 'NOT_AUTHORIZED', 'Only a game administrator can control the console.');
        return;
    }

    if (!consoleControlEnabled) {
        sendError(socket, 'CONSOLE_CONTROL_DISABLED', 'Console system controls are disabled.');
        return;
    }

    if (consoleSystemActionPending) {
        sendError(socket, 'CONSOLE_ACTION_PENDING', 'A console system action is already pending.');
        return;
    }

    let action;

    try {
        action = validateConsoleAction(message.action);
    } catch (error) {
        sendError(socket, 'INVALID_CONSOLE_ACTION', 'Unsupported console system action.');
        return;
    }

    consoleSystemActionPending = true;
    persistAllGames();

    send(socket, 'console-system-action-accepted', {
        action
    });
    sendConsoleControlState(socket);

    setTimeout(() => {
        executeConsoleAction(action, {}, (error) => {
            if (!error) {
                return;
            }

            consoleSystemActionPending = false;
            console.error(`Unable to execute console system action ${action}:`, error);

            send(socket, 'console-system-action-failed', {
                action,
                message: error.message
            });
            sendConsoleControlState(socket);
        });
    }, 500).unref();
}

function watchGame(socket, message) {
    const game = getGame(message.gameCode);

    if (!game) {
        sendError(
            socket,
            'GAME_NOT_FOUND',
            'The requested game does not exist.'
        );

        return;
    }

    detachSocket(socket);

    game.screenSockets.add(socket);

    socket.session = {
        role: 'screen',
        gameCode: game.code
    };

    send(socket, 'game-watched', {
        gameCode: game.code
    });

    broadcastGameState(game);

    console.log(`Shared screen connected to game: ${game.code}`);
}

/**
 * Registers a new player in a lobby.
 *
 * @param {WebSocket} socket Player WebSocket connection.
 * @param {Object} message Received protocol message.
 *
 * @returns {void}
 */
function joinGame(socket, message) {
    const game = getGame(message.gameCode);

    if (!game) {
        sendError(socket, 'GAME_NOT_FOUND', 'The requested game does not exist.');
        return;
    }

    if (game.status !== 'lobby') {
        sendError(socket, 'GAME_ALREADY_STARTED', 'The game has already started.');
        return;
    }

    if (game.players.size >= MAX_PLAYERS) {
        sendError(socket, 'GAME_FULL', `The game already has ${MAX_PLAYERS} players.`);
        return;
    }

    const playerName = typeof message.playerName === 'string'
        ? message.playerName.trim()
        : '';

    if (playerName.length < 1 || playerName.length > 30) {
        sendError(
            socket,
            'INVALID_PLAYER_NAME',
            'The player name must contain between 1 and 30 characters.'
        );
        return;
    }

    const duplicateName = Array.from(game.players.values()).some(
        (player) => player.name.toLowerCase() === playerName.toLowerCase()
    );

    if (duplicateName) {
        sendError(
            socket,
            'PLAYER_NAME_ALREADY_USED',
            'This player name is already used in the game.'
        );
        return;
    }

    detachSocket(socket);

    const player = {
        id: randomUUID(),
        token: randomUUID(),
        name: playerName,
        score: 0,
        rack: [],
        socket,
        removalTimer: null
    };

    game.players.set(player.id, player);

    socket.session = {
        role: 'player',
        gameCode: game.code,
        playerId: player.id
    };

    send(socket, 'game-joined', {
        gameCode: game.code,
        playerId: player.id,
        playerToken: player.token,
        playerName: player.name
    });

    broadcastGameState(game);

    console.log(`Player "${player.name}" joined game ${game.code}`);
}

/**
 * Restores a previously authenticated player session.
 *
 * @param {WebSocket} socket Player WebSocket connection.
 * @param {Object} message Received protocol message.
 *
 * @returns {void}
 */
function resumeGame(socket, message) {
    const game = getGame(message.gameCode);

    if (!game) {
        sendError(socket, 'GAME_NOT_FOUND', 'The requested game does not exist.');
        return;
    }

    const playerToken = typeof message.playerToken === 'string'
        ? message.playerToken.trim()
        : '';

    const player = Array.from(game.players.values()).find(
        (candidate) => candidate.token === playerToken
    );

    if (!player) {
        sendError(
            socket,
            'PLAYER_SESSION_NOT_FOUND',
            'The saved player session is no longer available.'
        );
        return;
    }

    detachSocket(socket);
    cancelPlayerRemoval(player);

    if (player.socket !== null && player.socket !== socket) {
        const previousSocket = player.socket;

        send(previousSocket, 'session-replaced', {
            message: 'This player session was resumed on another connection.'
        });

        previousSocket.session = null;
        previousSocket.close(4001, 'Session resumed elsewhere');
    }

    player.socket = socket;

    socket.session = {
        role: 'player',
        gameCode: game.code,
        playerId: player.id
    };

    send(socket, 'session-resumed', {
        gameCode: game.code,
        playerId: player.id,
        playerName: player.name
    });

    sendPrivatePlayerState(game, player);
    broadcastGameState(game);

    console.log(`Player "${player.name}" resumed game ${game.code}`);
}

/**
 * Determines the first player before any private rack is dealt.
 *
 * The starting-player draw follows the francophone classic rule. All tiles
 * used by the draw are returned to the bag before the game can begin.
 *
 * @param {WebSocket} socket Administrator WebSocket connection.
 *
 * @returns {void}
 */
function startGame(socket) {
    const session = socket.session;

    if (!session || session.role !== 'admin' || !session.gameCode) {
        sendError(socket, 'NOT_AUTHORIZED', 'Only a game administrator can start the game.');
        return;
    }

    const game = games.get(session.gameCode);

    if (!game) {
        sendError(socket, 'GAME_NOT_FOUND', 'The game does not exist.');
        return;
    }

    if (game.status !== 'lobby') {
        sendError(socket, 'GAME_ALREADY_STARTED', 'The game has already left the lobby.');
        return;
    }

    if (game.players.size < MIN_PLAYERS) {
        sendError(
            socket,
            'NOT_ENOUGH_PLAYERS',
            `At least ${MIN_PLAYERS} players are required to start.`
        );
        return;
    }

    const disconnectedPlayers = Array.from(game.players.values()).filter(
        (player) => player.socket === null
    );

    if (disconnectedPlayers.length > 0) {
        sendError(
            socket,
            'PLAYER_DISCONNECTED',
            'All players must be connected before determining the first player.'
        );
        return;
    }

    game.bag = createFrenchTileBag();
    game.board = createBoard();
    game.currentPlayerId = null;
    game.turnNumber = 0;
    game.lastMove = null;
    game.lastAction = null;
    game.pendingMove = null;
    game.finalResult = null;
    game.stopReason = null;
    game.stoppedAt = null;
    game.consecutivePasses = 0;
    game.turnClock.elapsedMs = 0;
    game.turnClock.startedAt = null;

    const playersInJoinOrder = Array.from(game.players.values());
    const joinOrderIds = playersInJoinOrder.map((player) => player.id);
    const startingPlayerDraw = determineStartingPlayer(
        game.bag,
        playersInJoinOrder
    );

    game.startingPlayerDraw = startingPlayerDraw;
    game.turnOrder = rotateTurnOrder(
        joinOrderIds,
        startingPlayerDraw.startingPlayerId
    );
    game.status = 'starting';

    getGameSockets(game).forEach((participantSocket) => {
        send(participantSocket, 'starting-player-determined', {
            gameCode: game.code,
            startingPlayerDraw
        });
    });

    broadcastGameState(game);

    console.log(
        `Game ${game.code}: ${startingPlayerDraw.startingPlayerName} will play first.`
    );
}

/**
 * Deals private racks and begins play after the first player is known.
 *
 * @param {WebSocket} socket Administrator WebSocket connection.
 *
 * @returns {void}
 */
function beginPlay(socket) {
    const session = socket.session;

    if (!session || session.role !== 'admin' || !session.gameCode) {
        sendError(socket, 'NOT_AUTHORIZED', 'Only a game administrator can begin play.');
        return;
    }

    const game = games.get(session.gameCode);

    if (!game) {
        sendError(socket, 'GAME_NOT_FOUND', 'The game does not exist.');
        return;
    }

    if (game.status !== 'starting' || game.startingPlayerDraw === null) {
        sendError(
            socket,
            'STARTING_PLAYER_NOT_DETERMINED',
            'The first player must be determined before dealing the racks.'
        );
        return;
    }

    const disconnectedPlayers = Array.from(game.players.values()).filter(
        (player) => player.socket === null
    );

    if (disconnectedPlayers.length > 0) {
        sendError(
            socket,
            'PLAYER_DISCONNECTED',
            'All players must be connected before dealing the racks.'
        );
        return;
    }

    game.players.forEach((player) => {
        cancelPlayerRemoval(player);
        player.score = 0;
        player.rack = drawTiles(game.bag, RACK_SIZE);
    });

    game.currentPlayerId = game.turnOrder[0] ?? null;
    game.turnNumber = 1;
    game.status = 'playing';
    resetTurnClock(game.turnClock);

    getGameSockets(game).forEach((participantSocket) => {
        send(participantSocket, 'game-started', {
            gameCode: game.code,
            startingPlayerId: game.currentPlayerId
        });
    });

    sendAllPrivatePlayerStates(game);
    broadcastGameState(game);

    console.log(
        `Game ${game.code} started with ${game.players.size} players and ${game.bag.length} tiles remaining.`
    );
}

/**
 * Advances the game to the next player in turn order.
 *
 * @param {Object} game Game instance.
 *
 * @returns {void}
 */
function advanceTurn(game) {
    if (game.turnOrder.length === 0) {
        game.currentPlayerId = null;
        return;
    }

    const currentIndex = game.turnOrder.indexOf(game.currentPlayerId);
    const nextIndex = currentIndex >= 0
        ? (currentIndex + 1) % game.turnOrder.length
        : 0;

    game.currentPlayerId = game.turnOrder[nextIndex];
    game.turnNumber += 1;
    resetTurnClock(game.turnClock);
}

/**
 * Finalizes a game and broadcasts the resulting public and private states.
 *
 * @param {Object} game Mutable game instance.
 * @param {string} reason End-game reason.
 * @param {string|null} finishingPlayerId Rack-empty finishing player ID.
 *
 * @returns {void}
 */
function finalizeAndBroadcastGame(game, reason, finishingPlayerId = null) {
    pauseTurnClock(game.turnClock);

    const finalResult = finishGame(
        game,
        reason,
        finishingPlayerId
    );

    getGameSockets(game).forEach((participantSocket) => {
        send(participantSocket, 'game-finished', {
            gameCode: game.code,
            finalResult
        });
    });

    sendAllPrivatePlayerStates(game);
    broadcastGameState(game);

    console.log(
        `Game ${game.code} finished: ${reason}.`
    );
}

/**
 * Finalizes a move that was staged for a challenge window.
 *
 * @param {Object} game Mutable game instance.
 * @param {Object} pendingMove Private pending move state.
 * @param {Object|null} challengedBy Challenging player or null.
 *
 * @returns {void}
 */
function acceptStagedMove(game, pendingMove, challengedBy = null) {
    const player = game.players.get(pendingMove.playerId);

    if (!player) {
        throw new Error('The player owning the pending move no longer exists.');
    }

    commitStagedMove(game.bag, player, pendingMove);
    game.consecutivePasses = 0;

    game.lastMove = {
        playerId: player.id,
        playerName: player.name,
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

    game.lastAction = {
        type: 'move',
        playerId: player.id,
        playerName: player.name,
        score: pendingMove.move.score,
        words: game.lastMove.words,
        challenged: challengedBy !== null,
        challengedByPlayerName: challengedBy?.name ?? null
    };

    game.pendingMove = null;

    if (player.socket !== null) {
        send(player.socket, 'move-accepted', {
            gameCode: game.code,
            score: pendingMove.move.score,
            bingoBonus: pendingMove.move.bingoBonus,
            words: game.lastMove.words,
            challenged: challengedBy !== null
        });
    }

    if (shouldEndAfterRackEmptied(game.bag, player.rack)) {
        finalizeAndBroadcastGame(
            game,
            END_REASON_RACK_EMPTIED,
            player.id
        );
        return;
    }

    advanceTurn(game);
    sendAllPrivatePlayerStates(game);
    broadcastGameState(game);
}

/**
 * Accepts a pending move without contesting its words.
 *
 * Only the next player may close the challenge window this way.
 *
 * @param {WebSocket} socket Next player's WebSocket connection.
 *
 * @returns {void}
 */
function acceptPendingMove(socket) {
    const session = socket.session;

    if (!session || session.role !== 'player' || !session.playerId) {
        sendError(socket, 'NOT_AUTHENTICATED_PLAYER', 'An authenticated player session is required.');
        return;
    }

    const game = games.get(session.gameCode);

    if (!game || game.status !== 'playing') {
        sendError(socket, 'GAME_NOT_PLAYING', 'The game is not currently playing.');
        return;
    }

    const pendingMove = game.pendingMove;

    if (pendingMove === null) {
        sendError(socket, 'NO_PENDING_MOVE', 'There is no move waiting for challenge resolution.');
        return;
    }

    if (pendingMove.nextPlayerId !== session.playerId) {
        sendError(socket, 'NOT_NEXT_PLAYER', 'Only the next player can accept the pending move.');
        return;
    }

    send(socket, 'challenge-window-closed', {
        gameCode: game.code
    });

    acceptStagedMove(game, pendingMove);
}

/**
 * Challenges every word created by the pending move.
 *
 * If at least one word is invalid, the complete move is rolled back and the
 * moving player loses the turn. If all words are valid, the move is committed.
 * An unsuccessful challenge applies the configured five-point penalty.
 *
 * @param {WebSocket} socket Challenging player's WebSocket connection.
 *
 * @returns {void}
 */
async function challengePendingMove(socket) {
    const session = socket.session;

    if (!session || session.role !== 'player' || !session.playerId) {
        sendError(socket, 'NOT_AUTHENTICATED_PLAYER', 'An authenticated player session is required.');
        return;
    }

    const game = games.get(session.gameCode);

    if (!game || game.status !== 'playing') {
        sendError(socket, 'GAME_NOT_PLAYING', 'The game is not currently playing.');
        return;
    }

    const pendingMove = game.pendingMove;

    if (pendingMove === null) {
        sendError(socket, 'NO_PENDING_MOVE', 'There is no move waiting for challenge resolution.');
        return;
    }

    if (pendingMove.playerId === session.playerId) {
        sendError(socket, 'CANNOT_CHALLENGE_OWN_MOVE', 'A player cannot challenge their own move.');
        return;
    }

    const challenger = game.players.get(session.playerId);
    const movingPlayer = game.players.get(pendingMove.playerId);

    if (!challenger || !movingPlayer) {
        sendError(socket, 'PLAYER_NOT_FOUND', 'The player session no longer exists.');
        return;
    }

    let invalidWords;
    const wordValidator = wordValidationRegistry.getValidator(
        game.wordValidationConfig
    );

    wordValidationLocks.add(game.code);

    try {
        invalidWords = await wordValidator.findInvalidWordsAsync(
            pendingMove.move.words.map((word) => word.text)
        );
    } catch (error) {
        if (error instanceof FfscWordCheckUnavailableError) {
            sendError(socket, error.code, error.message);
            return;
        }

        throw error;
    } finally {
        wordValidationLocks.delete(game.code);
    }

    if (invalidWords.length === 0) {
        const penalty = applyUnsuccessfulChallengePenalty(challenger);

        send(socket, 'challenge-result', {
            gameCode: game.code,
            successful: false,
            invalidWords: [],
            penalty
        });

        acceptStagedMove(game, pendingMove, challenger);
        return;
    }

    rollbackStagedMove(game.board, movingPlayer, pendingMove);
    game.pendingMove = null;
    game.consecutivePasses += 1;
    game.lastAction = {
        type: 'challenge-success',
        playerId: challenger.id,
        playerName: challenger.name,
        challengedPlayerId: movingPlayer.id,
        challengedPlayerName: movingPlayer.name,
        invalidWords
    };

    send(socket, 'challenge-result', {
        gameCode: game.code,
        successful: true,
        invalidWords
    });

    if (movingPlayer.socket !== null) {
        send(movingPlayer.socket, 'move-rejected-after-challenge', {
            gameCode: game.code,
            invalidWords
        });
    }

    if (shouldEndAfterConsecutivePasses(
        game.bag.length,
        game.consecutivePasses,
        game.players.size
    )) {
        finalizeAndBroadcastGame(
            game,
            END_REASON_CONSECUTIVE_PASSES
        );
        return;
    }

    advanceTurn(game);
    sendAllPrivatePlayerStates(game);
    broadcastGameState(game);
}

/**
 * Validates and applies a player's proposed board move.
 *
 * Every formed word is validated when a configured dictionary is enabled.
 *
 * @param {WebSocket} socket Player WebSocket connection.
 * @param {Object} message Received protocol message.
 *
 * @returns {void}
 */
async function submitMove(socket, message) {
    const session = socket.session;

    if (!session || session.role !== 'player' || !session.playerId) {
        sendError(
            socket,
            'NOT_AUTHENTICATED_PLAYER',
            'An authenticated player session is required.'
        );
        return;
    }

    const game = games.get(session.gameCode);

    if (!game) {
        sendError(socket, 'GAME_NOT_FOUND', 'The game does not exist.');
        return;
    }

    if (game.status !== 'playing') {
        sendError(socket, 'GAME_NOT_PLAYING', 'The game is not currently playing.');
        return;
    }

    const player = game.players.get(session.playerId);

    if (!player) {
        sendError(socket, 'PLAYER_NOT_FOUND', 'The player session no longer exists.');
        return;
    }

    if (game.currentPlayerId !== player.id) {
        sendError(socket, 'NOT_YOUR_TURN', 'It is not your turn.');
        return;
    }

    if (game.pendingMove !== null) {
        sendError(
            socket,
            'PENDING_MOVE_REQUIRES_RESOLUTION',
            'The previous move must be accepted or challenged first.'
        );
        return;
    }

    let move;

    try {
        move = validateAndScoreMove(
            game.board,
            player.rack,
            message.placements
        );
    } catch (error) {
        if (error instanceof MoveValidationError) {
            sendError(socket, error.code, error.message);
            return;
        }

        throw error;
    }

    const wordValidationConfig = wordValidationRegistry.restoreConfiguration(
        game.wordValidationConfig
    );
    const wordValidator = wordValidationRegistry.getValidator(
        wordValidationConfig
    );

    game.wordValidationConfig = wordValidationConfig;

    if (wordValidationConfig.policy === 'challenge' && wordValidator.enabled) {
        const nextPlayerId = getNextPlayerId(
            game.turnOrder,
            game.currentPlayerId
        );

        game.pendingMove = stageMove(
            game.board,
            player,
            move,
            nextPlayerId
        );
        pauseTurnClock(game.turnClock);

        send(socket, 'move-pending-challenge', {
            gameCode: game.code,
            score: move.score,
            bingoBonus: move.bingoBonus,
            words: move.words.map((word) => ({
                text: word.text,
                score: word.score
            }))
        });

        sendAllPrivatePlayerStates(game);
        broadcastGameState(game);
        return;
    }

    wordValidationLocks.add(game.code);

    try {
        await validateMoveWordsAsync(move.words, wordValidator);
    } catch (error) {
        if (error instanceof WordValidationError) {
            sendError(
                socket,
                error.code,
                error.message,
                {
                    invalidWords: error.invalidWords
                }
            );
            return;
        }

        if (error instanceof FfscWordCheckUnavailableError) {
            sendError(socket, error.code, error.message);
            return;
        }

        throw error;
    } finally {
        wordValidationLocks.delete(game.code);
    }

    applyMove(game.board, move);

    const usedTileIds = new Set(
        move.placements.map((placement) => placement.tile.id)
    );

    player.rack = player.rack.filter(
        (tile) => !usedTileIds.has(tile.id)
    );

    player.score += move.score;
    game.consecutivePasses = 0;

    const replacementTiles = drawTiles(
        game.bag,
        RACK_SIZE - player.rack.length
    );

    player.rack.push(...replacementTiles);

    game.lastMove = {
        playerId: player.id,
        playerName: player.name,
        score: move.score,
        bingoBonus: move.bingoBonus,
        words: move.words.map((word) => ({
            text: word.text,
            score: word.score
        })),
        placements: move.placements.map((placement) => ({
            row: placement.row,
            column: placement.column
        }))
    };

    game.lastAction = {
        type: 'move',
        playerId: player.id,
        playerName: player.name,
        score: move.score,
        words: game.lastMove.words
    };

    send(socket, 'move-accepted', {
        gameCode: game.code,
        score: move.score,
        bingoBonus: move.bingoBonus,
        words: game.lastMove.words
    });

    if (shouldEndAfterRackEmptied(game.bag, player.rack)) {
        finalizeAndBroadcastGame(
            game,
            END_REASON_RACK_EMPTIED,
            player.id
        );
        return;
    }

    advanceTurn(game);
    sendAllPrivatePlayerStates(game);
    broadcastGameState(game);

    console.log(
        `Player "${player.name}" scored ${move.score} points in game ${game.code}.`
    );
}

/**
 * Returns the authenticated player for a turn action after validating
 * the current game and turn ownership.
 *
 * @param {WebSocket} socket Player WebSocket connection.
 *
 * @returns {Object|null} Game and player pair, or null after an error response.
 */
function getCurrentTurnContext(socket) {
    const session = socket.session;

    if (!session || session.role !== 'player' || !session.playerId) {
        sendError(
            socket,
            'NOT_AUTHENTICATED_PLAYER',
            'An authenticated player session is required.'
        );
        return null;
    }

    const game = games.get(session.gameCode);

    if (!game) {
        sendError(socket, 'GAME_NOT_FOUND', 'The game does not exist.');
        return null;
    }

    if (game.status !== 'playing') {
        sendError(socket, 'GAME_NOT_PLAYING', 'The game is not currently playing.');
        return null;
    }

    const player = game.players.get(session.playerId);

    if (!player) {
        sendError(socket, 'PLAYER_NOT_FOUND', 'The player session no longer exists.');
        return null;
    }

    if (game.currentPlayerId !== player.id) {
        sendError(socket, 'NOT_YOUR_TURN', 'It is not your turn.');
        return null;
    }

    if (game.pendingMove !== null) {
        sendError(
            socket,
            'PENDING_MOVE_REQUIRES_RESOLUTION',
            'The pending move must be accepted or challenged first.'
        );
        return null;
    }

    return {
        game,
        player
    };
}

/**
 * Passes the authenticated player's turn without modifying rack or score.
 *
 * @param {WebSocket} socket Player WebSocket connection.
 *
 * @returns {void}
 */
function passTurn(socket) {
    const context = getCurrentTurnContext(socket);

    if (context === null) {
        return;
    }

    const { game, player } = context;

    game.consecutivePasses += 1;

    game.lastAction = {
        type: 'pass',
        playerId: player.id,
        playerName: player.name
    };

    send(socket, 'turn-passed', {
        gameCode: game.code
    });

    if (shouldEndAfterConsecutivePasses(
        game.bag.length,
        game.consecutivePasses,
        game.players.size
    )) {
        finalizeAndBroadcastGame(
            game,
            END_REASON_CONSECUTIVE_PASSES
        );
        return;
    }

    advanceTurn(game);
    sendAllPrivatePlayerStates(game);
    broadcastGameState(game);

    console.log(
        `Player "${player.name}" passed turn ${game.turnNumber - 1} in game ${game.code}.`
    );
}

/**
 * Exchanges selected private rack tiles and ends the player's turn.
 *
 * The server validates that at least seven tiles remain in the bag before
 * the exchange and draws replacements before returning discarded tiles.
 *
 * @param {WebSocket} socket Player WebSocket connection.
 * @param {Object} message Received protocol message.
 *
 * @returns {void}
 */
function exchangePlayerTiles(socket, message) {
    const context = getCurrentTurnContext(socket);

    if (context === null) {
        return;
    }

    const { game, player } = context;
    let exchangeResult;

    try {
        exchangeResult = exchangeTiles(
            game.bag,
            player.rack,
            message.tileIds
        );
    } catch (error) {
        if (error instanceof TurnActionError) {
            sendError(socket, error.code, error.message);
            return;
        }

        throw error;
    }

    player.rack = exchangeResult.rack;
    game.consecutivePasses = 0;

    game.lastAction = {
        type: 'exchange',
        playerId: player.id,
        playerName: player.name,
        exchangedCount: exchangeResult.exchangedCount
    };

    send(socket, 'tiles-exchanged', {
        gameCode: game.code,
        exchangedCount: exchangeResult.exchangedCount
    });

    advanceTurn(game);
    sendAllPrivatePlayerStates(game);
    broadcastGameState(game);

    console.log(
        `Player "${player.name}" exchanged ${exchangeResult.exchangedCount} tile(s) in game ${game.code}.`
    );
}

/**
 * Handles an incoming protocol message.
 *
 * @param {WebSocket} socket Client WebSocket connection.
 * @param {Object} message Parsed protocol message.
 *
 * @returns {void}
 */
async function handleMessage(socket, message) {
    if (!message || typeof message.type !== 'string') {
        sendError(socket, 'INVALID_MESSAGE', 'The message type is missing.');
        return;
    }

    const lockedGameCode = socket.session?.gameCode ?? null;

    if (
        lockedGameCode &&
        wordValidationLocks.has(lockedGameCode) &&
        WORD_VALIDATION_LOCKED_MESSAGE_TYPES.has(message.type)
    ) {
        sendError(
            socket,
            'WORD_CHECK_IN_PROGRESS',
            'A word verification is already in progress for this game.'
        );
        return;
    }

    switch (message.type) {
        case 'create-game':
            createGame(socket, message);
            break;

        case 'resume-admin':
            resumeAdmin(socket, message);
            break;

        case 'list-managed-games':
            listManagedGames(socket, message);
            break;

        case 'purge-game':
            purgeManagedGame(socket, message);
            break;

        case 'configure-turn-clock':
            configureGameClock(socket, message);
            break;

        case 'configure-word-validation':
            configureGameWordValidation(socket, message);
            break;

        case 'watch-game':
            watchGame(socket, message);
            break;

        case 'watch-console':
            watchConsole(socket);
            break;

        case 'join-game':
            joinGame(socket, message);
            break;

        case 'resume-game':
            resumeGame(socket, message);
            break;

        case 'start-game':
            startGame(socket);
            break;

        case 'begin-play':
            beginPlay(socket);
            break;

        case 'submit-move':
            await submitMove(socket, message);
            break;

        case 'accept-pending-move':
            acceptPendingMove(socket);
            break;

        case 'challenge-pending-move':
            await challengePendingMove(socket);
            break;

        case 'pass-turn':
            passTurn(socket);
            break;

        case 'exchange-tiles':
            exchangePlayerTiles(socket, message);
            break;

        case 'stop-game':
            stopGame(socket);
            break;

        case 'resume-stopped-game':
            resumeStoppedGame(socket);
            break;

        case 'console-system-action':
            requestConsoleSystemAction(socket, message);
            break;

        default:
            sendError(
                socket,
                'UNKNOWN_MESSAGE_TYPE',
                `Unknown message type: ${message.type}`
            );
    }
}

/**
 * Marks a WebSocket connection as alive after a pong response.
 *
 * @returns {void}
 */
function heartbeat() {
    this.isAlive = true;
}

server.on('connection', (socket, request) => {
    socket.isAlive = true;
    socket.session = null;

    socket.on('pong', heartbeat);

    console.log(`Client connected: ${request.socket.remoteAddress}`);

    send(socket, 'connected', {
        message: 'Connected to Electronic Scrabble server.',
        wordValidationOptions: wordValidationRegistry.getPublicOptions()
    });

    socket.on('message', async (data) => {
        let message;

        try {
            message = JSON.parse(data.toString());
        } catch (error) {
            console.error('Invalid JSON message:', error);
            sendError(socket, 'INVALID_JSON', 'The received message is not valid JSON.');
            return;
        }

        try {
            await handleMessage(socket, message);
        } catch (error) {
            console.error('Unable to process message:', error);
            sendError(socket, 'INTERNAL_SERVER_ERROR', 'The server could not process the request.');
        }
    });

    socket.on('error', (error) => {
        console.error('WebSocket error:', error);
    });

    socket.on('close', () => {
        detachSocket(socket);
        console.log('Client disconnected');
    });
});

const persistenceInterval = setInterval(() => {
    persistAllGames();
}, PERSISTENCE_INTERVAL_MS);

const heartbeatInterval = setInterval(() => {
    server.clients.forEach((socket) => {
        if (socket.isAlive === false) {
            socket.terminate();
            return;
        }

        socket.isAlive = false;
        socket.ping();
    });
}, 30000);

server.on('close', () => {
    clearInterval(heartbeatInterval);
    clearInterval(persistenceInterval);
});

const wordValidationOptions = wordValidationRegistry.getPublicOptions();

console.log(
    `Word-validation providers: ${wordValidationOptions.providers
        .map((provider) => provider.id)
        .join(', ')}.`
);
console.log(
    `Default word validation: ${wordValidationOptions.defaultProvider} / ${wordValidationOptions.defaultPolicy}.`
);

console.log(
    `Persistent game data directory: ${gameStore.directory}`
);
console.log(
    `Restored ${restoredGames.games.length} persisted game(s).`
);
console.log(
    `Console system controls: ${consoleControlEnabled ? 'enabled' : 'disabled'}.`
);
console.log(`Electronic Scrabble WebSocket server listening on port ${PORT}`);

/**
 * Persists all games before a graceful process shutdown.
 *
 * @param {string} signal Operating-system signal name.
 *
 * @returns {void}
 */
function handleShutdown(signal) {
    console.log(`Received ${signal}; persisting games before shutdown.`);
    persistAllGames();
    clearInterval(persistenceInterval);
    clearInterval(heartbeatInterval);
    server.close(() => {
        process.exit(0);
    });

    setTimeout(() => {
        process.exit(0);
    }, 2000).unref();
}

process.once('SIGINT', () => handleShutdown('SIGINT'));
process.once('SIGTERM', () => handleShutdown('SIGTERM'));
