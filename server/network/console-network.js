/**
 * Electronic Scrabble console network configuration.
 *
 * Builds the public connection information shown by the dedicated screen and
 * the Wi-Fi QR payload used by compatible mobile devices.
 *
 * @author Electronic Scrabble Project
 * @version 1.0.0
 */

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
 * Escapes a value for the common WIFI QR payload format.
 *
 * @param {string} value Raw SSID or password.
 *
 * @returns {string} Escaped WIFI QR value.
 */
function escapeWifiQrValue(value) {
    return String(value).replace(/[\\;,\":]/g, (character) => `\\${character}`);
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
 * Loads the console network configuration from environment variables.
 *
 * @param {Object} environment Environment source.
 *
 * @returns {Object} Public console network configuration.
 */
function loadConsoleNetworkConfig(environment = process.env) {
    const accessPointEnabled = parseBoolean(
        environment.ELECTRONIC_SCRABBLE_WIFI_ACCESS_POINT
    );
    const httpPort = Number.parseInt(
        environment.ELECTRONIC_SCRABBLE_HTTP_PORT || String(DEFAULT_HTTP_PORT),
        10
    );
    const address = stripCidr(
        environment.ELECTRONIC_SCRABBLE_WIFI_ADDRESS || DEFAULT_ACCESS_POINT_ADDRESS
    );
    const ssid = environment.ELECTRONIC_SCRABBLE_WIFI_SSID || DEFAULT_ACCESS_POINT_SSID;
    const password = environment.ELECTRONIC_SCRABBLE_WIFI_PASSWORD || '';
    const configuredBaseUrl = environment.ELECTRONIC_SCRABBLE_PUBLIC_BASE_URL;
    const baseUrl = normalizeBaseUrl(
        configuredBaseUrl || `http://${address}:${httpPort}`
    );

    return Object.freeze({
        accessPointEnabled,
        address,
        ssid,
        password: accessPointEnabled ? password : '',
        security: accessPointEnabled ? 'WPA' : null,
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
 * @returns {string|null} Wi-Fi payload or null when access point mode is off.
 */
function buildWifiQrPayload(config) {
    if (!config.accessPointEnabled || !config.password) {
        return null;
    }

    return `WIFI:T:WPA;S:${escapeWifiQrValue(config.ssid)};P:${escapeWifiQrValue(config.password)};H:false;;`;
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
    escapeWifiQrValue,
    loadConsoleNetworkConfig,
    normalizeBaseUrl,
    parseBoolean,
    stripCidr
};
