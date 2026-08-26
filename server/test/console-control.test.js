/**
 * Electronic Scrabble Raspberry Pi console-control tests.
 *
 * Verifies that host control remains disabled by default and that only fixed
 * reboot and power-off systemctl commands can be executed.
 *
 * @author Electronic Scrabble Project
 * @version 1.0.0
 */

const assert = require('node:assert/strict');
const test = require('node:test');
const {
    ACTION_POWEROFF,
    ACTION_REBOOT,
    executeConsoleAction,
    isConsoleControlEnabled,
    validateConsoleAction
} = require('../system/console-control');

test('console system controls are disabled unless explicitly enabled', () => {
    assert.equal(isConsoleControlEnabled({}), false);
    assert.equal(isConsoleControlEnabled({ ELECTRONIC_SCRABBLE_CONSOLE_CONTROL: '0' }), false);
    assert.equal(isConsoleControlEnabled({ ELECTRONIC_SCRABBLE_CONSOLE_CONTROL: '1' }), true);
});

test('only reboot and poweroff actions are accepted', () => {
    assert.equal(validateConsoleAction(ACTION_REBOOT), ACTION_REBOOT);
    assert.equal(validateConsoleAction(ACTION_POWEROFF), ACTION_POWEROFF);
    assert.throws(() => validateConsoleAction('restart-service'));
    assert.throws(() => validateConsoleAction('shell'));
});

test('console action executes a fixed non-interactive sudo systemctl command', async () => {
    const call = await new Promise((resolve, reject) => {
        executeConsoleAction(
            ACTION_REBOOT,
            {
                sudoPath: '/usr/bin/sudo',
                systemctlPath: '/usr/bin/systemctl',
                executor(file, args, options, callback) {
                    resolve({ file, args, options });
                    callback(null, '', '');
                }
            },
            (error) => {
                if (error) {
                    reject(error);
                }
            }
        );
    });

    assert.equal(call.file, '/usr/bin/sudo');
    assert.deepEqual(call.args, [
        '-n',
        '/usr/bin/systemctl',
        'reboot'
    ]);
    assert.equal(call.options.timeout, 5000);
});
