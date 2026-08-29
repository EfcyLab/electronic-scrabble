/**
 * Electronic Scrabble Milestone 22 correction contract tests.
 *
 * Protects translated validation controls, paused-game validation changes,
 * direct rack-to-board dragging, and Raspberry Pi Wi-Fi administration.
 *
 * @author Electronic Scrabble Project
 * @version 0.25.0
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const projectRoot = path.resolve(__dirname, '../..');
const adminHtml = fs.readFileSync(path.join(projectRoot, 'admin/index.html'), 'utf8');
const playerHtml = fs.readFileSync(path.join(projectRoot, 'player/index.html'), 'utf8');
const serverSource = fs.readFileSync(path.join(projectRoot, 'server/server.js'), 'utf8');
const accessPointConfigurator = fs.readFileSync(
    path.join(projectRoot, 'deploy/raspberry-pi/configure-access-point.sh'),
    'utf8'
);
const installer = fs.readFileSync(
    path.join(projectRoot, 'deploy/raspberry-pi/install.sh'),
    'utf8'
);
const gameService = fs.readFileSync(
    path.join(projectRoot, 'deploy/raspberry-pi/electronic-scrabble-server.service.in'),
    'utf8'
);
const english = require(path.join(projectRoot, 'shared/i18n/en.js'));
const french = require(path.join(projectRoot, 'shared/i18n/fr.js'));

const validationTranslationKeys = [
    'admin.validationProvider',
    'admin.validationProviderStructural',
    'admin.validationProviderLocal',
    'admin.validationProviderFfsc',
    'admin.validationPolicy',
    'admin.validationPolicyStructural',
    'admin.validationPolicyAutomatic',
    'admin.validationPolicyChallenge',
    'admin.validationConfigurationHelp',
    'admin.validationConfigurationLocked',
    'admin.validationStructuralHelp',
    'admin.validationLocalHelp',
    'admin.validationFfscHelp'
];

test('all administrator validation controls have English and French translations', () => {
    validationTranslationKeys.forEach((key) => {
        assert.equal(typeof english[key], 'string', `Missing English key: ${key}`);
        assert.equal(typeof french[key], 'string', `Missing French key: ${key}`);
        assert.notEqual(english[key], key);
        assert.notEqual(french[key], key);
    });
});

test('word-validation settings can be changed in the lobby or while a game is paused', () => {
    assert.match(
        adminHtml,
        /!\['lobby', 'stopped'\]\.includes\(currentGameStatus\)/
    );
    assert.match(
        serverSource,
        /!\['lobby', 'stopped'\]\.includes\(game\.status\)/
    );
    assert.match(
        french['admin.validationConfigurationLocked'],
        /pause/i
    );
});

test('rack tiles can be dragged directly onto an empty board square', () => {
    assert.match(playerHtml, /function getRackBoardDropTarget\(clientX, clientY\)/);
    assert.match(playerHtml, /button\.dataset\.row = String\(cell\.row\)/);
    assert.match(playerHtml, /button\.dataset\.column = String\(cell\.column\)/);
    assert.match(playerHtml, /player-board-cell--rack-drop-target/);
    assert.match(playerHtml, /placeSelectedTile\(dropTarget\.row, dropTarget\.column\)/);
    assert.doesNotMatch(playerHtml, /document\.elementFromPoint/);
});

test('administrator console exposes Wi-Fi SSID, password, country, save, and activation controls', () => {
    assert.match(adminHtml, /id="console-wifi-form"/);
    assert.match(adminHtml, /id="console-wifi-ssid"/);
    assert.match(adminHtml, /id="console-wifi-password"/);
    assert.match(adminHtml, /id="console-wifi-country"/);
    assert.match(adminHtml, /id="console-wifi-apply"/);
    assert.match(adminHtml, /id="console-wifi-activate"/);
    assert.match(adminHtml, /type:\s*'configure-console-wifi'/);
    assert.match(serverSource, /case 'configure-console-wifi':/);
});

test('Raspberry Pi deployment grants only the fixed Wi-Fi helper and allows its environment file update', () => {
    assert.match(installer, /ELECTRONIC_SCRABBLE_WIFI_CONTROL 1/);
    assert.match(
        installer,
        /NOPASSWD: \/usr\/local\/sbin\/electronic-scrabble-configure-access-point/
    );
    assert.doesNotMatch(installer, /NOPASSWD:\s+ALL/);
    assert.match(gameService, /ReadWritePaths=.*\/etc\/electronic-scrabble/);
});

test('access-point helper updates an existing NetworkManager profile without deleting it first', () => {
    assert.match(accessPointConfigurator, /--ssid/);
    assert.match(accessPointConfigurator, /--password/);
    assert.match(accessPointConfigurator, /--country/);
    assert.match(accessPointConfigurator, /nmcli connection modify/);
    assert.doesNotMatch(accessPointConfigurator, /nmcli connection delete/);
});
