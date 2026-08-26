/**
 * Electronic Scrabble static web-server tests.
 *
 * Verifies that production HTTP serving exposes only browser-facing assets.
 *
 * @author Electronic Scrabble Project
 * @version 1.0.0
 */

const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const test = require('node:test');
const {
    createStaticWebServer,
    resolvePublicFile
} = require('../static-web-server');

/**
 * Performs an HTTP request against a local test server.
 *
 * @param {number} port Local server port.
 * @param {string} requestPath Request path.
 *
 * @returns {Promise<Object>} HTTP response summary.
 */
function request(port, requestPath) {
    return new Promise((resolve, reject) => {
        const clientRequest = http.get({
            host: '127.0.0.1',
            port,
            path: requestPath
        }, (response) => {
            let body = '';

            response.setEncoding('utf8');
            response.on('data', (chunk) => {
                body += chunk;
            });
            response.on('end', () => {
                resolve({
                    statusCode: response.statusCode,
                    headers: response.headers,
                    body
                });
            });
        });

        clientRequest.on('error', reject);
    });
}

test('static path resolver allows UI assets but refuses private server files', () => {
    const projectRoot = path.resolve(__dirname, '../..');

    assert.match(
        resolvePublicFile('/screen/', projectRoot),
        /screen[\\/]index\.html$/
    );
    assert.equal(resolvePublicFile('/server/server.js', projectRoot), null);
    assert.equal(resolvePublicFile('/docs/protocol.md', projectRoot), null);
    assert.equal(resolvePublicFile('/.git/config', projectRoot), null);
});

test('static server redirects root to dedicated console mode', async () => {
    const server = createStaticWebServer();

    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;

    try {
        const response = await request(port, '/');

        assert.equal(response.statusCode, 302);
        assert.equal(response.headers.location, '/screen/?console=1');
    } finally {
        await new Promise((resolve) => server.close(resolve));
    }
});

test('static server serves screen UI and rejects private server source', async () => {
    const server = createStaticWebServer();

    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;

    try {
        const screenResponse = await request(port, '/screen/');
        const privateResponse = await request(port, '/server/server.js');

        assert.equal(screenResponse.statusCode, 200);
        assert.match(screenResponse.body, /Electronic Scrabble/);
        assert.equal(privateResponse.statusCode, 404);
    } finally {
        await new Promise((resolve) => server.close(resolve));
    }
});
