/**
 * Electronic Scrabble WebSocket server.
 */

const WebSocket = require('ws');

const port = 8080;
const server = new WebSocket.Server({ port });

server.on('connection', (socket) => {
    console.log('Client connected');

    socket.on('message', (data) => {
        const message = data.toString();

        console.log('Received:', message);

        for (const client of server.clients) {
            if (client.readyState === WebSocket.OPEN) {
                client.send(message);
            }
        }
    });

    socket.on('close', () => {
        console.log('Client disconnected');
    });
});

console.log(`WebSocket server listening on port ${port}`);