/**
 * Electronic Scrabble WebSocket Server
 *
 * Manages game sessions, lobby synchronization, player reconnection,
 * game startup, private racks, turn order, and validated board moves.
 *
 * The server is the authoritative source of the game state.
 *
 * @author Electronic Scrabble Project
 * @version 0.7.0
 */

const WebSocket = require('ws');
const { randomInt, randomUUID } = require('node:crypto');
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

const PORT = 8080;
const MIN_PLAYERS = 2;
const MAX_PLAYERS = 4;
const GAME_CODE_LENGTH = 4;
const GAME_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const LOBBY_RECONNECT_GRACE_MS = 30000;

const games = new Map();

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
function sendError(socket, code, message) {
    send(socket, 'error', {
        code,
        message
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
        bagRemaining: game.status === 'lobby' ? null : game.bag.length,
        board: getPublicBoardState(game.board),
        currentPlayerId: game.currentPlayerId,
        turnNumber: game.turnNumber,
        lastMove: game.lastMove,
        lastAction: game.lastAction,
        finalResult: game.finalResult,
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

    game.players.forEach((player) => {
        if (player.socket !== null) {
            sockets.add(player.socket);
        }
    });

    return sockets;
}

/**
 * Broadcasts the public game state to every connected participant.
 *
 * @param {Object} game Game instance.
 *
 * @returns {void}
 */
function broadcastGameState(game) {
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

    if (!session || !session.gameCode) {
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
function createGame(socket) {
    detachSocket(socket);

    const gameCode = generateGameCode();

    const game = {
        code: gameCode,
        status: 'lobby',
        bag: [],
        board: createBoard(),
        players: new Map(),
        turnOrder: [],
        currentPlayerId: null,
        turnNumber: 0,
        lastMove: null,
        lastAction: null,
        finalResult: null,
        consecutivePasses: 0,
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
        gameCode
    });

    broadcastGameState(game);

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
 * Starts a game and deals seven private tiles to every player.
 *
 * Milestone 0.5 uses lobby join order as the initial turn order.
 * Official starting-player tile selection can be added independently later.
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
        sendError(socket, 'GAME_ALREADY_STARTED', 'The game has already started.');
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
            'All players must be connected before starting the game.'
        );
        return;
    }

    game.bag = createFrenchTileBag();
    game.board = createBoard();
    game.turnOrder = Array.from(game.players.keys());
    game.currentPlayerId = game.turnOrder[0] ?? null;
    game.turnNumber = 1;
    game.lastMove = null;
    game.lastAction = null;
    game.finalResult = null;
    game.consecutivePasses = 0;

    game.players.forEach((player) => {
        cancelPlayerRemoval(player);
        player.score = 0;
        player.rack = drawTiles(game.bag, RACK_SIZE);
    });

    game.status = 'playing';

    getGameSockets(game).forEach((participantSocket) => {
        send(participantSocket, 'game-started', {
            gameCode: game.code
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
 * Validates and applies a player's proposed board move.
 *
 * Dictionary validation is intentionally not performed in milestone 0.5.
 *
 * @param {WebSocket} socket Player WebSocket connection.
 * @param {Object} message Received protocol message.
 *
 * @returns {void}
 */
function submitMove(socket, message) {
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
function handleMessage(socket, message) {
    if (!message || typeof message.type !== 'string') {
        sendError(socket, 'INVALID_MESSAGE', 'The message type is missing.');
        return;
    }

    switch (message.type) {
        case 'create-game':
            createGame(socket);
            break;

        case 'watch-game':
            watchGame(socket, message);
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

        case 'submit-move':
            submitMove(socket, message);
            break;

        case 'pass-turn':
            passTurn(socket);
            break;

        case 'exchange-tiles':
            exchangePlayerTiles(socket, message);
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
        message: 'Connected to Electronic Scrabble server.'
    });

    socket.on('message', (data) => {
        let message;

        try {
            message = JSON.parse(data.toString());
        } catch (error) {
            console.error('Invalid JSON message:', error);
            sendError(socket, 'INVALID_JSON', 'The received message is not valid JSON.');
            return;
        }

        try {
            handleMessage(socket, message);
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
});

console.log(`Electronic Scrabble WebSocket server listening on port ${PORT}`);
