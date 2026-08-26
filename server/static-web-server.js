/**
 * Electronic Scrabble static web server.
 *
 * Serves only the browser-facing application directories and a small set of
 * console-network APIs. Private server source, dictionaries, tests,
 * persistent game snapshots, and deployment files remain unreachable.
 *
 * @author Electronic Scrabble Project
 * @version 1.1.0
 */

const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { URL } = require('node:url');
const {
    buildPlayerJoinUrl,
    buildWifiQrPayload,
    loadConsoleNetworkConfig
} = require('./network/console-network');
const { renderQrSvg } = require('./qr/qr-code');

const DEFAULT_HOST = '0.0.0.0';
const DEFAULT_PORT = 8000;
const PROJECT_ROOT = path.resolve(__dirname, '..');
const ALLOWED_DIRECTORIES = new Set([
    'admin',
    'player',
    'screen',
    'shared'
]);

const CONTENT_TYPES = Object.freeze({
    '.css': 'text/css; charset=utf-8',
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.webp': 'image/webp'
});

/**
 * Returns shared security headers for dynamic responses.
 *
 * @returns {Object} HTTP headers.
 */
function getSecurityHeaders() {
    return {
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'no-referrer'
    };
}

/**
 * Sends a plain HTTP response.
 *
 * @param {http.ServerResponse} response HTTP response.
 * @param {number} statusCode HTTP status code.
 * @param {string} body Response body.
 *
 * @returns {void}
 */
function sendText(response, statusCode, body) {
    response.writeHead(statusCode, {
        ...getSecurityHeaders(),
        'Content-Type': 'text/plain; charset=utf-8'
    });
    response.end(body);
}

/**
 * Sends a JSON HTTP response.
 *
 * @param {http.ServerResponse} response HTTP response.
 * @param {number} statusCode HTTP status code.
 * @param {Object} body JSON response body.
 *
 * @returns {void}
 */
function sendJson(response, statusCode, body) {
    const payload = JSON.stringify(body);

    response.writeHead(statusCode, {
        ...getSecurityHeaders(),
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': Buffer.byteLength(payload)
    });
    response.end(payload);
}

/**
 * Sends an SVG HTTP response.
 *
 * @param {http.ServerResponse} response HTTP response.
 * @param {number} statusCode HTTP status code.
 * @param {string} svg SVG body.
 *
 * @returns {void}
 */
function sendSvg(response, statusCode, svg) {
    response.writeHead(statusCode, {
        ...getSecurityHeaders(),
        'Content-Type': 'image/svg+xml; charset=utf-8',
        'Content-Length': Buffer.byteLength(svg)
    });
    response.end(svg);
}

/**
 * Resolves a public request path to an allowed project file.
 *
 * @param {string} pathname URL pathname.
 * @param {string} projectRoot Project root directory.
 *
 * @returns {string|null} Resolved file path or null when access is denied.
 */
function resolvePublicFile(pathname, projectRoot = PROJECT_ROOT) {
    let decodedPath;

    try {
        decodedPath = decodeURIComponent(pathname);
    } catch (error) {
        return null;
    }

    const normalized = path.posix.normalize(decodedPath);
    const segments = normalized.split('/').filter(Boolean);

    if (segments.length === 0 || !ALLOWED_DIRECTORIES.has(segments[0])) {
        return null;
    }

    if (segments.some((segment) => segment === '..' || segment.startsWith('.'))) {
        return null;
    }

    const relativePath = normalized.endsWith('/')
        ? `${normalized}index.html`
        : normalized;
    const resolvedPath = path.resolve(projectRoot, `.${relativePath}`);
    const allowedRoot = path.resolve(projectRoot, segments[0]);

    if (
        resolvedPath !== allowedRoot &&
        !resolvedPath.startsWith(`${allowedRoot}${path.sep}`)
    ) {
        return null;
    }

    return resolvedPath;
}

/**
 * Handles console-network and QR-code API requests.
 *
 * @param {URL} requestUrl Parsed request URL.
 * @param {http.ServerResponse} response HTTP response.
 * @param {Object} networkConfig Console network configuration.
 * @param {Function} qrRenderer QR SVG renderer.
 *
 * @returns {Promise<boolean>} Whether the request was handled.
 */
async function handleApiRequest(requestUrl, response, networkConfig, qrRenderer) {
    if (requestUrl.pathname === '/api/console-network') {
        sendJson(response, 200, {
            accessPointEnabled: networkConfig.accessPointEnabled,
            ssid: networkConfig.accessPointEnabled ? networkConfig.ssid : null,
            password: networkConfig.accessPointEnabled ? networkConfig.password : null,
            security: networkConfig.security,
            address: networkConfig.address,
            baseUrl: networkConfig.baseUrl,
            playerBaseUrl: networkConfig.playerBaseUrl,
            adminUrl: networkConfig.adminUrl
        });
        return true;
    }

    if (requestUrl.pathname === '/api/qr/wifi.svg') {
        const payload = buildWifiQrPayload(networkConfig);

        if (!payload) {
            sendText(response, 404, 'Wi-Fi access point QR code is unavailable.\n');
            return true;
        }

        try {
            sendSvg(response, 200, await qrRenderer(payload));
        } catch (error) {
            console.error('Unable to render Wi-Fi QR code:', error.message);
            sendText(response, 503, 'QR code renderer is unavailable.\n');
        }

        return true;
    }

    if (requestUrl.pathname === '/api/qr/player.svg') {
        try {
            const playerUrl = buildPlayerJoinUrl(
                networkConfig,
                requestUrl.searchParams.get('game')
            );
            sendSvg(response, 200, await qrRenderer(playerUrl));
        } catch (error) {
            const statusCode = error.message === 'Invalid game code.' ? 400 : 503;

            if (statusCode === 503) {
                console.error('Unable to render player QR code:', error.message);
            }

            sendText(response, statusCode, `${error.message}\n`);
        }

        return true;
    }

    if (requestUrl.pathname.startsWith('/api/')) {
        sendText(response, 404, 'Not found.\n');
        return true;
    }

    return false;
}

/**
 * Creates the static HTTP server.
 *
 * @param {Object} options Server options.
 * @param {string} options.projectRoot Project root directory.
 * @param {Object} options.networkConfig Console network configuration.
 * @param {Function} options.qrRenderer QR SVG renderer.
 *
 * @returns {http.Server} Configured HTTP server.
 */
function createStaticWebServer({
    projectRoot = PROJECT_ROOT,
    networkConfig = loadConsoleNetworkConfig(),
    qrRenderer = renderQrSvg
} = {}) {
    return http.createServer((request, response) => {
        const requestUrl = new URL(request.url ?? '/', 'http://localhost');

        Promise.resolve(handleApiRequest(
            requestUrl,
            response,
            networkConfig,
            qrRenderer
        )).then((handled) => {
            if (handled) {
                return;
            }

            if (requestUrl.pathname === '/') {
                response.writeHead(302, {
                    Location: '/screen/?console=1',
                    'Cache-Control': 'no-cache'
                });
                response.end();
                return;
            }

            const filePath = resolvePublicFile(requestUrl.pathname, projectRoot);

            if (!filePath) {
                sendText(response, 404, 'Not found.\n');
                return;
            }

            let stats;

            try {
                stats = fs.statSync(filePath);
            } catch (error) {
                sendText(response, 404, 'Not found.\n');
                return;
            }

            if (!stats.isFile()) {
                sendText(response, 404, 'Not found.\n');
                return;
            }

            const extension = path.extname(filePath).toLowerCase();
            const contentType = CONTENT_TYPES[extension] || 'application/octet-stream';

            response.writeHead(200, {
                'Content-Type': contentType,
                'Content-Length': stats.size,
                'Cache-Control': 'no-cache',
                'X-Content-Type-Options': 'nosniff',
                'Referrer-Policy': 'no-referrer'
            });

            fs.createReadStream(filePath).pipe(response);
        }).catch((error) => {
            console.error('Unexpected static web server error:', error);

            if (!response.headersSent) {
                sendText(response, 500, 'Internal server error.\n');
            } else {
                response.end();
            }
        });
    });
}

if (require.main === module) {
    const host = process.env.ELECTRONIC_SCRABBLE_HTTP_HOST || DEFAULT_HOST;
    const port = Number.parseInt(
        process.env.ELECTRONIC_SCRABBLE_HTTP_PORT || String(DEFAULT_PORT),
        10
    );
    const networkConfig = loadConsoleNetworkConfig();
    const server = createStaticWebServer({ networkConfig });

    server.listen(port, host, () => {
        console.log(`Electronic Scrabble web server listening on http://${host}:${port}`);
        console.log(`Player URL: ${networkConfig.playerBaseUrl}`);

        if (networkConfig.accessPointEnabled) {
            console.log(`Autonomous Wi-Fi: ${networkConfig.ssid} (${networkConfig.address})`);
        }
    });

    const shutdown = (signal) => {
        console.log(`Received ${signal}; stopping Electronic Scrabble web server.`);
        server.close(() => process.exit(0));
        setTimeout(() => process.exit(0), 2000).unref();
    };

    process.once('SIGINT', () => shutdown('SIGINT'));
    process.once('SIGTERM', () => shutdown('SIGTERM'));
}

module.exports = {
    ALLOWED_DIRECTORIES,
    createStaticWebServer,
    handleApiRequest,
    resolvePublicFile
};
