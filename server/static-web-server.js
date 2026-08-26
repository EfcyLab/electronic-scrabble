/**
 * Electronic Scrabble static web server.
 *
 * Serves only the browser-facing application directories. Private server
 * source, dictionaries, tests, persistent game snapshots, and deployment
 * files are intentionally unreachable through this HTTP service.
 *
 * @author Electronic Scrabble Project
 * @version 1.0.0
 */

const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { URL } = require('node:url');

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
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache',
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'no-referrer'
    });
    response.end(body);
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
 * Creates the static HTTP server.
 *
 * @param {Object} options Server options.
 * @param {string} options.projectRoot Project root directory.
 *
 * @returns {http.Server} Configured HTTP server.
 */
function createStaticWebServer({ projectRoot = PROJECT_ROOT } = {}) {
    return http.createServer((request, response) => {
        const requestUrl = new URL(request.url ?? '/', 'http://localhost');

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
    });
}

if (require.main === module) {
    const host = process.env.ELECTRONIC_SCRABBLE_HTTP_HOST || DEFAULT_HOST;
    const port = Number.parseInt(
        process.env.ELECTRONIC_SCRABBLE_HTTP_PORT || String(DEFAULT_PORT),
        10
    );
    const server = createStaticWebServer();

    server.listen(port, host, () => {
        console.log(`Electronic Scrabble web server listening on http://${host}:${port}`);
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
    resolvePublicFile
};
