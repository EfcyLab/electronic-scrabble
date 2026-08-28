/**
 * Electronic Scrabble console Wi-Fi control tests.
 *
 * Verifies validation and the narrow sudo bridge used by the Raspberry Pi
 * administration console.
 *
 * @author Electronic Scrabble Project
 * @version 0.24.0
 */

const assert = require('node:assert/strict');
const test = require('node:test');
const {
    WifiConfigurationError,
    buildWifiConfiguratorArguments,
    executeWifiConfiguration,
    isWifiControlEnabled,
    validateWifiConfiguration
} = require('../system/wifi-control');

test('Wi-Fi console configuration is disabled unless explicitly enabled', () => {
    assert.equal(isWifiControlEnabled({}), false);
    assert.equal(isWifiControlEnabled({ ELECTRONIC_SCRABBLE_WIFI_CONTROL: '1' }), true);
});

test('Wi-Fi configuration normalizes SSID, country, and optional password', () => {
    assert.deepEqual(
        validateWifiConfiguration({
            ssid: '  ElectronicScrabble  ',
            password: 'Scrabble123',
            country: 'fr',
            activate: true
        }),
        {
            ssid: 'ElectronicScrabble',
            password: 'Scrabble123',
            country: 'FR',
            activate: true
        }
    );

    assert.equal(
        validateWifiConfiguration({
            ssid: 'ElectronicScrabble',
            password: '',
            country: ''
        }).password,
        null
    );
});

test('Wi-Fi configuration rejects invalid SSID, password, and country values', () => {
    assert.throws(
        () => validateWifiConfiguration({ ssid: '', password: 'Scrabble123' }),
        WifiConfigurationError
    );
    assert.throws(
        () => validateWifiConfiguration({ ssid: 'ElectronicScrabble', password: 'short' }),
        WifiConfigurationError
    );
    assert.throws(
        () => validateWifiConfiguration({ ssid: 'ElectronicScrabble', password: 'Bad Pass 123' }),
        WifiConfigurationError
    );
    assert.throws(
        () => validateWifiConfiguration({
            ssid: 'ElectronicScrabble',
            password: 'Scrabble123',
            country: 'FRA'
        }),
        WifiConfigurationError
    );
});

test('Wi-Fi configurator preserves the password when no new password is supplied', () => {
    const argumentsList = buildWifiConfiguratorArguments(
        validateWifiConfiguration({
            ssid: 'ElectronicScrabble',
            password: '',
            country: 'FR'
        })
    );

    assert.deepEqual(argumentsList, [
        '--ssid',
        'ElectronicScrabble',
        '--country',
        'FR'
    ]);
});

test('Wi-Fi configuration executes only the fixed non-interactive sudo helper', async () => {
    let invocation = null;

    await new Promise((resolve, reject) => {
        executeWifiConfiguration(
            {
                ssid: 'ElectronicScrabble',
                password: 'Scrabble123',
                country: 'FR',
                activate: true
            },
            {
                sudoPath: '/usr/bin/sudo',
                configuratorPath: '/usr/local/sbin/electronic-scrabble-configure-access-point',
                executor(file, args, options, callback) {
                    invocation = { file, args, options };
                    callback(null, '', '');
                }
            },
            (error) => {
                if (error) {
                    reject(error);
                    return;
                }

                resolve();
            }
        );
    });

    assert.equal(invocation.file, '/usr/bin/sudo');
    assert.deepEqual(invocation.args, [
        '-n',
        '/usr/local/sbin/electronic-scrabble-configure-access-point',
        '--ssid',
        'ElectronicScrabble',
        '--password',
        'Scrabble123',
        '--country',
        'FR',
        '--activate'
    ]);
    assert.equal(invocation.options.windowsHide, true);
});
