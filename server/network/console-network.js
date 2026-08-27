/**
 * Electronic Scrabble console network configuration.
 *
 * Builds public connection information for autonomous access-point mode and
 * ordinary LAN/VM development environments. Wi-Fi QR availability is based
 * on configured credentials rather than on the host platform.
 *
 * @author Electronic Scrabble Project
 * @version 3.0.0
 */

const os = require('node:os');

const DEFAULT_HTTP_PORT = 8000;
const DEFAULT_ACCESS_POINT_ADDRESS = '10.42.0.1';
const DEFAULT_ACCESS_POINT_SSID = 'ElectronicScrabble';

/**
 * Parses a boolean environment value.
 *
 * @param {string|undefined} value Environment value.
 *
 * @returns {boolean} Parsed boolean value.
 */
function parseBoolean(value) {
    return ['1', 'true', 'yes', 'on'].includes(String(value ?? '').toLowerCase());
}

/**
 * Removes a CIDR suffix from an IPv4 address.
 *
 * @param {string} value IPv4 address with or without CIDR notation.
 *
 * @returns {string} Plain host address.
 */
function stripCidr(value) {
    return String(value).split('/')[0];
}

/**
 * Escapes a value for the WIFI QR payload format.
 *
 * @param {string} value Raw SSID or password.
 *
 * @returns {string} Escaped WIFI QR value.
 */
function escapeWifiQrValue(value) {
    return String(value).replace(/[\\;,":]/g, (character) => `\\${character}`);
}

/**
 * Normalizes a public console base URL.
 *
 * @param {string} value Requested base URL.
 *
 * @returns {string} Normalized URL without a trailing slash.
 */
function normalizeBaseUrl(value) {
    const parsed = new URL(value);

    if (!['http:', 'https:'].includes(parsed.protocol)) {
        throw new Error('The console public base URL must use HTTP or HTTPS.');
    }

    parsed.pathname = '/';
    parsed.search = '';
    parsed.hash = '';

    return parsed.toString().replace(/\/$/, '');
}

/**
 * Finds a non-loopback IPv4 address suitable for LAN development.
 *
 * @param {Object} interfaces Network-interface map.
 *
 * @returns {string|null} Detected IPv4 address or null.
 */
function detectLanAddress(interfaces = os.networkInterfaces()) {
    const candidates = [];

    Object.entries(interfaces ?? {}).forEach(([name, addresses]) => {
        (addresses ?? []).forEach((entry) => {
            if (
                entry &&
                entry.family === 'IPv4' &&
                !entry.internal &&
                typeof entry.address === 'string'
            ) {
                candidates.push({
                    name,
                    address: entry.address
                });
            }
        });
    });

    if (candidates.length === 0) {
        return null;
    }

    const preferred = candidates.find((candidate) =>
        /^(wlan|wifi|wl|eth|en)/i.test(candidate.name)
    );

    return (preferred ?? candidates[0]).address;
}

/**
 * Loads the console network configuration from environment variables.
 *
 * A Wi-Fi QR can be generated whenever an SSID and password are explicitly
 * configured. This is intentionally independent from access-point mode so a
 * development VM can test a QR for an existing Wi-Fi network as well.
 *
 * @param {Object} environment Environment source.
 * @param {Object} options Detection options.
 * @param {Object} options.interfaces Network-interface map for tests.
 *
 * @returns {Object} Public console network configuration.
 */
function loadConsoleNetworkConfig(
    environment = process.env,
    { interfaces = os.networkInterfaces() } = {}
) {
    const accessPointEnabled = parseBoolean(
        environment.ELECTRONIC_SCRABBLE_WIFI_ACCESS_POINT
    );
    const httpPort = Number.parseInt(
        environment.ELECTRONIC_SCRABBLE_HTTP_PORT || String(DEFAULT_HTTP_PORT),
        10
    );
    const accessPointAddress = stripCidr(
        environment.ELECTRONIC_SCRABBLE_WIFI_ADDRESS || DEFAULT_ACCESS_POINT_ADDRESS
    );
    const detectedLanAddress = detectLanAddress(interfaces);
    const address = accessPointEnabled
        ? accessPointAddress
        : stripCidr(
            environment.ELECTRONIC_SCRABBLE_PUBLIC_ADDRESS ||
            detectedLanAddress ||
            '127.0.0.1'
        );
    const configuredSsid = String(
        environment.ELECTRONIC_SCRABBLE_WIFI_SSID || ''
    ).trim();
    const configuredPassword = String(
        environment.ELECTRONIC_SCRABBLE_WIFI_PASSWORD || ''
    );
    const ssid = configuredSsid || (accessPointEnabled ? DEFAULT_ACCESS_POINT_SSID : '');
    const password = configuredPassword;
    const wifiConfigured = ssid.length > 0 && password.length >= 8 && password.length <= 63;
    const configuredBaseUrl = environment.ELECTRONIC_SCRABBLE_PUBLIC_BASE_URL;
    const baseUrl = normalizeBaseUrl(
        configuredBaseUrl || `http://${address}:${httpPort}`
    );

    return Object.freeze({
        accessPointEnabled,
        wifiConfigured,
        address,
        ssid: wifiConfigured ? ssid : null,
        password: wifiConfigured ? password : '',
        security: wifiConfigured ? 'WPA' : null,
        baseUrl,
        playerBaseUrl: `${baseUrl}/player/`,
        adminUrl: `${baseUrl}/admin/`
    });
}

/**
 * Builds a mobile-compatible Wi-Fi configuration QR payload.
 *
 * @param {Object} config Console network configuration.
 *
 * @returns {string|null} Wi-Fi payload or null when credentials are missing.
 */
function buildWifiQrPayload(config) {
    if (!config.wifiConfigured || !config.password || !config.ssid) {
        return null;
    }

    return `WIFI:T:WPA;S:${escapeWifiQrValue(config.ssid)};P:${escapeWifiQrValue(config.password)};;`;
}

/**
 * Builds the game-specific player URL.
 *
 * @param {Object} config Console network configuration.
 * @param {string} gameCode Public game code.
 *
 * @returns {string} Player join URL.
 */
function buildPlayerJoinUrl(config, gameCode) {
    const normalizedGameCode = String(gameCode ?? '').trim().toUpperCase();

    if (!/^[A-Z2-9]{4}$/.test(normalizedGameCode)) {
        throw new Error('Invalid game code.');
    }

    const url = new URL(config.playerBaseUrl);
    url.searchParams.set('game', normalizedGameCode);

    return url.toString();
}

module.exports = {
    DEFAULT_ACCESS_POINT_ADDRESS,
    DEFAULT_ACCESS_POINT_SSID,
    buildPlayerJoinUrl,
    buildWifiQrPayload,
    detectLanAddress,
    escapeWifiQrValue,
    loadConsoleNetworkConfig,
    normalizeBaseUrl,
    parseBoolean,
    stripCidr
};
