/**
 * Electronic Scrabble console system control.
 *
 * Provides a deliberately narrow bridge between the game server and the
 * Raspberry Pi operating system. Only reboot and power-off actions are
 * supported, and execution is disabled unless explicitly enabled through
 * configuration.
 *
 * @author Electronic Scrabble Project
 * @version 1.0.0
 */

const { execFile } = require('node:child_process');

const ACTION_REBOOT = 'reboot';
const ACTION_POWEROFF = 'poweroff';
const SUPPORTED_ACTIONS = new Set([
    ACTION_REBOOT,
    ACTION_POWEROFF
]);

/**
 * Returns whether console power controls are enabled.
 *
 * @param {Object} environment Environment variables.
 *
 * @returns {boolean} True when console power controls are enabled.
 */
function isConsoleControlEnabled(environment = process.env) {
    return environment.ELECTRONIC_SCRABBLE_CONSOLE_CONTROL === '1';
}

/**
 * Validates a requested console system action.
 *
 * @param {string} action Requested action.
 *
 * @returns {string} Validated action.
 *
 * @throws {Error} When the requested action is unsupported.
 */
function validateConsoleAction(action) {
    if (!SUPPORTED_ACTIONS.has(action)) {
        throw new Error(`Unsupported console system action: ${action}.`);
    }

    return action;
}

/**
 * Executes a supported console system action through a fixed sudo/systemctl
 * command pair.
 *
 * The deployment installer grants the service account passwordless access
 * only to `systemctl reboot` and `systemctl poweroff`.
 *
 * @param {string} action Requested action.
 * @param {Object} options Execution options.
 * @param {Function} options.executor Process executor compatible with execFile.
 * @param {string} options.sudoPath Absolute sudo path.
 * @param {string} options.systemctlPath Absolute systemctl path.
 * @param {Function} callback Completion callback.
 *
 * @returns {void}
 */
function executeConsoleAction(
    action,
    {
        executor = execFile,
        sudoPath = process.env.ELECTRONIC_SCRABBLE_SUDO_PATH || '/usr/bin/sudo',
        systemctlPath = process.env.ELECTRONIC_SCRABBLE_SYSTEMCTL_PATH || '/usr/bin/systemctl'
    } = {},
    callback = () => {}
) {
    const validatedAction = validateConsoleAction(action);

    executor(
        sudoPath,
        [
            '-n',
            systemctlPath,
            validatedAction
        ],
        {
            timeout: 5000,
            windowsHide: true
        },
        callback
    );
}

module.exports = {
    ACTION_POWEROFF,
    ACTION_REBOOT,
    executeConsoleAction,
    isConsoleControlEnabled,
    validateConsoleAction
};
