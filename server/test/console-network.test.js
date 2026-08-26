/**
 * Electronic Scrabble console-network tests.
 *
 * Verifies autonomous Wi-Fi configuration, QR payload escaping, and
 * game-specific player URLs.
 *
 * @author Electronic Scrabble Project
 * @version 1.0.0
 */

const assert = require('node:assert/strict');
const test = require('node:test');
const {
    buildPlayerJoinUrl,
    buildWifiQrPayload,
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

test('Wi-Fi QR payload follows the WIFI schema and escapes reserved characters', () => {
    const config = loadConsoleNetworkConfig({
        ELECTRONIC_SCRABBLE_WIFI_ACCESS_POINT: '1',
        ELECTRONIC_SCRABBLE_WIFI_SSID: 'Scrabble;Room',
        ELECTRONIC_SCRABBLE_WIFI_PASSWORD: 'Pass:word,1'
    });

    assert.equal(escapeWifiQrValue('a;b:c,d\\e"f'), 'a\\;b\\:c\\,d\\\\e\\"f');
    assert.equal(
        buildWifiQrPayload(config),
        'WIFI:T:WPA;S:Scrabble\\;Room;P:Pass\\:word\\,1;H:false;;'
    );
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
