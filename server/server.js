/**
 * Electronic Scrabble WebSocket Server
 *
 * Provides real-time communication between the shared screen
 * and player devices.
 *
 * @author Electronic Scrabble Project
 * @version 0.1.0
 */

const WebSocket = require('ws');

const PORT = 8080;

const server = new WebSocket.WebSocketServer({
    port: PORT
});

/**
 * Broadcasts a JSON message to all connected clients.
 *
 * @param {Object} message Message to broadcast.
 *
 * @returns {void}
 */
function broadcast(message) {
    const payload = JSON.stringify(message);

    server.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(payload);
        }
    });
}

server.on('connection', (socket, request) => {
    console.log(`Client connected: ${request.socket.remoteAddress}`);

    socket.send(JSON.stringify({
        type: 'system',
        message: 'Connected to Electronic Scrabble server.'
    }));

    socket.on('message', (data) => {
        try {
            const message = JSON.parse(data.toString());

            console.log('Message received:', message);

            broadcast(message);
        } catch (error) {
            console.error('Invalid message received:', error.message);

            socket.send(JSON.stringify({
                type: 'error',
                message: 'Invalid JSON message.'
            }));
        }
    });

    socket.on('error', (error) => {
        console.error('WebSocket error:', error);
    });

    socket.on('close', () => {
        console.log('Client disconnected');
    });
});

console.log(`Electronic Scrabble WebSocket server listening on port ${PORT}`);