/**
 * Electronic Scrabble console-network tests.
 *
 * Verifies autonomous Wi-Fi configuration, ordinary LAN/VM discovery, QR
 * payload escaping, and game-specific player URLs.
 *
 * @author Electronic Scrabble Project
 * @version 3.0.0
 */

const assert = require('node:assert/strict');
const test = require('node:test');
const {
    buildPlayerJoinUrl,
    buildWifiQrPayload,
    detectLanAddress,
    escapeWifiQrValue,
    loadConsoleNetworkConfig
} = require('../network/console-network');

test('console network configuration exposes autonomous access-point URLs', () => {
    const config = loadConsoleNetworkConfig({
        ELECTRONIC_SCRABBLE_WIFI_ACCESS_POINT: '1',
        ELECTRONIC_SCRABBLE_WIFI_SSID: 'ElectronicScrabble',
        ELECTRONIC_SCRABBLE_WIFI_PASSWORD: 'Secret1234',
        ELECTRONIC_SCRABBLE_WIFI_ADDRESS: '10.42.0.1/24',
        ELECTRONIC_SCRABBLE_HTTP_PORT: '8000'
    });

    assert.equal(config.accessPointEnabled, true);
    assert.equal(config.address, '10.42.0.1');
    assert.equal(config.playerBaseUrl, 'http://10.42.0.1:8000/player/');
    assert.equal(config.adminUrl, 'http://10.42.0.1:8000/admin/');
});

test('console network configuration detects a normal LAN or VM IPv4 address', () => {
    const interfaces = {
        lo: [{ family: 'IPv4', internal: true, address: '127.0.0.1' }],
        eth0: [{ family: 'IPv4', internal: false, address: '192.168.56.20' }]
    };
    const config = loadConsoleNetworkConfig({
        ELECTRONIC_SCRABBLE_HTTP_PORT: '8000'
    }, { interfaces });

    assert.equal(detectLanAddress(interfaces), '192.168.56.20');
    assert.equal(config.accessPointEnabled, false);
    assert.equal(config.address, '192.168.56.20');
    assert.equal(config.playerBaseUrl, 'http://192.168.56.20:8000/player/');
    assert.equal(config.ssid, null);
});

test('explicit public base URL overrides automatic LAN detection', () => {
    const config = loadConsoleNetworkConfig({
        ELECTRONIC_SCRABBLE_PUBLIC_BASE_URL: 'http://192.168.1.99:8000'
    }, {
        interfaces: {
            eth0: [{ family: 'IPv4', internal: false, address: '10.0.2.15' }]
        }
    });

    assert.equal(config.baseUrl, 'http://192.168.1.99:8000');
    assert.equal(config.playerBaseUrl, 'http://192.168.1.99:8000/player/');
});

test('Wi-Fi QR payload follows the WIFI schema and escapes reserved characters', () => {
    const config = loadConsoleNetworkConfig({
        ELECTRONIC_SCRABBLE_WIFI_ACCESS_POINT: '1',
        ELECTRONIC_SCRABBLE_WIFI_SSID: 'Scrabble;Room',
        ELECTRONIC_SCRABBLE_WIFI_PASSWORD: 'Pass:word,1'
    });

    assert.equal(escapeWifiQrValue('a;b:c,d\\e"f'), 'a\\;b\\:c\\,d\\\\e\\"f');
    assert.equal(
        buildWifiQrPayload(config),
        'WIFI:T:WPA;S:Scrabble\\;Room;P:Pass\\:word\\,1;;'
    );
});

test('Wi-Fi QR is omitted when no Wi-Fi credentials are configured', () => {
    const config = loadConsoleNetworkConfig({}, {
        interfaces: {
            eth0: [{ family: 'IPv4', internal: false, address: '192.168.1.20' }]
        }
    });

    assert.equal(buildWifiQrPayload(config), null);
});

test('Wi-Fi QR can be generated on a VM when SSID and password are configured', () => {
    const config = loadConsoleNetworkConfig({
        ELECTRONIC_SCRABBLE_WIFI_SSID: 'HomeScrabble',
        ELECTRONIC_SCRABBLE_WIFI_PASSWORD: 'Secret1234'
    }, {
        interfaces: {
            eth0: [{ family: 'IPv4', internal: false, address: '192.168.56.20' }]
        }
    });

    assert.equal(config.accessPointEnabled, false);
    assert.equal(config.wifiConfigured, true);
    assert.equal(config.ssid, 'HomeScrabble');
    assert.equal(buildWifiQrPayload(config), 'WIFI:T:WPA;S:HomeScrabble;P:Secret1234;;');
});

test('player QR URL targets the selected public game', () => {
    const config = loadConsoleNetworkConfig({
        ELECTRONIC_SCRABBLE_WIFI_ACCESS_POINT: '1',
        ELECTRONIC_SCRABBLE_WIFI_PASSWORD: 'Secret1234',
        ELECTRONIC_SCRABBLE_PUBLIC_BASE_URL: 'http://10.42.0.1:8000'
    });

    assert.equal(
        buildPlayerJoinUrl(config, 'a2bc'),
        'http://10.42.0.1:8000/player/?game=A2BC'
    );
    assert.throws(() => buildPlayerJoinUrl(config, 'bad'), /Invalid game code/);
});
