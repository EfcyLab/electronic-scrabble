/**
 * Electronic Scrabble console Wi-Fi control.
 *
 * Provides a narrow, validated bridge between the authenticated
 * administration interface and the root-owned Raspberry Pi access-point
 * configurator. Arbitrary shell commands are never accepted.
 *
 * @author Electronic Scrabble Project
 * @version 1.0.0
 */

const { execFile } = require('node:child_process');

const DEFAULT_CONFIGURATOR_PATH = '/usr/local/sbin/electronic-scrabble-configure-access-point';
const DEFAULT_SUDO_PATH = '/usr/bin/sudo';
const MAX_SSID_BYTES = 32;
const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 63;

class WifiConfigurationError extends Error {
    /**
     * Creates a Wi-Fi configuration validation error.
     *
     * @param {string} code Stable error code.
     * @param {string} message Human-readable error message.
     */
    constructor(code, message) {
        super(message);
        this.name = 'WifiConfigurationError';
        this.code = code;
    }
}

/**
 * Returns whether console Wi-Fi configuration is enabled.
 *
 * @param {Object} environment Environment variables.
 *
 * @returns {boolean} True when Wi-Fi administration is enabled.
 */
function isWifiControlEnabled(environment = process.env) {
    return environment.ELECTRONIC_SCRABBLE_WIFI_CONTROL === '1';
}

/**
 * Normalizes and validates one requested access-point configuration.
 *
 * An empty password means "keep the current password". The root helper may
 * generate a password when configuring an access point for the first time.
 *
 * @param {Object} input Raw administrator input.
 *
 * @returns {Object} Validated Wi-Fi configuration.
 *
 * @throws {WifiConfigurationError} When a value is unsafe or unsupported.
 */
function validateWifiConfiguration(input = {}) {
    const ssid = typeof input.ssid === 'string'
        ? input.ssid.trim()
        : '';
    const password = typeof input.password === 'string'
        ? input.password
        : '';
    const country = typeof input.country === 'string'
        ? input.country.trim().toUpperCase()
        : '';
    const activate = input.activate === true;

    if (
        ssid.length === 0
        || Buffer.byteLength(ssid, 'utf8') > MAX_SSID_BYTES
        || /[\r\n]/.test(ssid)
    ) {
        throw new WifiConfigurationError(
            'INVALID_WIFI_CONFIGURATION',
            'The Wi-Fi SSID must contain between 1 and 32 bytes and no line breaks.'
        );
    }

    if (password.length > 0) {
        if (
            password.length < MIN_PASSWORD_LENGTH
            || password.length > MAX_PASSWORD_LENGTH
            || /[\r\n]/.test(password)
            || /[\s#=]/.test(password)
        ) {
            throw new WifiConfigurationError(
                'INVALID_WIFI_CONFIGURATION',
                'The Wi-Fi password must contain 8 to 63 characters and no spaces, #, =, or line breaks.'
            );
        }
    }

    if (country.length > 0 && !/^[A-Z]{2}$/.test(country)) {
        throw new WifiConfigurationError(
            'INVALID_WIFI_CONFIGURATION',
            'The Wi-Fi country must be a two-letter regulatory code.'
        );
    }

    return Object.freeze({
        ssid,
        password: password.length > 0 ? password : null,
        country: country.length > 0 ? country : null,
        activate
    });
}

/**
 * Builds the fixed configurator argument list for one validated request.
 *
 * @param {Object} configuration Validated configuration.
 *
 * @returns {Array<string>} Configurator command arguments.
 */
function buildWifiConfiguratorArguments(configuration) {
    const argumentsList = [
        '--ssid',
        configuration.ssid
    ];

    if (configuration.password !== null) {
        argumentsList.push('--password', configuration.password);
    }

    if (configuration.country !== null) {
        argumentsList.push('--country', configuration.country);
    }

    if (configuration.activate) {
        argumentsList.push('--activate');
    }

    return argumentsList;
}

/**
 * Executes the root-owned Wi-Fi configurator through non-interactive sudo.
 *
 * The helper path is fixed by server configuration and the request values are
 * validated before execution. No shell is involved.
 *
 * @param {Object} configuration Validated Wi-Fi configuration.
 * @param {Object} options Execution options.
 * @param {Function} options.executor Process executor compatible with execFile.
 * @param {string} options.sudoPath Absolute sudo path.
 * @param {string} options.configuratorPath Absolute configurator path.
 * @param {Function} callback Completion callback.
 *
 * @returns {void}
 */
function executeWifiConfiguration(
    configuration,
    {
        executor = execFile,
        sudoPath = process.env.ELECTRONIC_SCRABBLE_SUDO_PATH || DEFAULT_SUDO_PATH,
        configuratorPath = process.env.ELECTRONIC_SCRABBLE_WIFI_CONFIGURATOR_PATH
            || DEFAULT_CONFIGURATOR_PATH
    } = {},
    callback = () => {}
) {
    const validatedConfiguration = validateWifiConfiguration(configuration);

    executor(
        sudoPath,
        [
            '-n',
            configuratorPath,
            ...buildWifiConfiguratorArguments(validatedConfiguration)
        ],
        {
            timeout: 20000,
            windowsHide: true
        },
        callback
    );
}

module.exports = {
    DEFAULT_CONFIGURATOR_PATH,
    MAX_PASSWORD_LENGTH,
    MAX_SSID_BYTES,
    MIN_PASSWORD_LENGTH,
    WifiConfigurationError,
    buildWifiConfiguratorArguments,
    executeWifiConfiguration,
    isWifiControlEnabled,
    validateWifiConfiguration
};
