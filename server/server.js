/**
 * Electronic Scrabble WebSocket Server
 *
 * Manages game sessions, player connections, shared screens,
 * administrators, and real-time lobby synchronization.
 *
 * The server is the authoritative source of the game state.
 *
 * @author Electronic Scrabble Project
 * @version 0.2.0
 */

const WebSocket = require('ws');
const { randomInt, randomUUID } = require('node:crypto');

const PORT = 8080;

const GAME_CODE_LENGTH = 4;
const GAME_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

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
 * Generates a unique game code.
 *
 * @returns {string} Generated game code.
 */
function generateGameCode() {
    let code;

    do {
        code = '';

        for (let index = 0; index < GAME_CODE_LENGTH; index += 1) {
            const characterIndex = randomInt(
                0,
                GAME_CODE_ALPHABET.length
            );

            code += GAME_CODE_ALPHABET[characterIndex];
        }
    } while (games.has(code));

    return code;
}

/**
 * Returns a game using its public code.
 *
 * @param {string} gameCode Game code.
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
 * Private player information must never be returned here.
 *
 * @param {Object} game Game instance.
 *
 * @returns {Object} Public game state.
 */
function getPublicGameState(game) {
    return {
        code: game.code,
        status: game.status,
        players: Array.from(game.players.values()).map((player) => ({
            id: player.id,
            name: player.name
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
 * Broadcasts the public game state to every game participant.
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
 * Detaches a socket from its current game session.
 *
 * Players are removed when disconnecting while the game is still
 * in the lobby.
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
        game.players.delete(session.playerId);
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
        players: new Map(),
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
 * Registers a player in a game.
 *
 * @param {WebSocket} socket Player WebSocket connection.
 * @param {Object} message Received protocol message.
 *
 * @returns {void}
 */
function joinGame(socket, message) {
    const game = getGame(message.gameCode);

    if (!game) {
        sendError(
            socket,
            'GAME_NOT_FOUND',
            'The requested game does not exist.'
        );

        return;
    }

    if (game.status !== 'lobby') {
        sendError(
            socket,
            'GAME_ALREADY_STARTED',
            'The game has already started.'
        );

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
        name: playerName,
        socket
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
        playerName: player.name
    });

    broadcastGameState(game);

    console.log(
        `Player "${player.name}" joined game ${game.code}`
    );
}

/**
 * Handles an incoming protocol message.
 *
 * @param {WebSocket} socket Client WebSocket connection.
 * @param {Object} message Parsed message.
 *
 * @returns {void}
 */
function handleMessage(socket, message) {
    if (!message || typeof message.type !== 'string') {
        sendError(
            socket,
            'INVALID_MESSAGE',
            'The message type is missing.'
        );

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

        default:
            sendError(
                socket,
                'UNKNOWN_MESSAGE_TYPE',
                `Unknown message type: ${message.type}`
            );
    }
}

/**
 * Marks a WebSocket connection as alive.
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

    console.log(
        `Client connected: ${request.socket.remoteAddress}`
    );

    send(socket, 'connected', {
        message: 'Connected to Electronic Scrabble server.'
    });

    socket.on('message', (data) => {
        try {
            const message = JSON.parse(data.toString());

            handleMessage(socket, message);
        } catch (error) {
            sendError(
                socket,
                'INVALID_JSON',
                'The received message is not valid JSON.'
            );
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

console.log(
    `Electronic Scrabble WebSocket server listening on port ${PORT}`
);