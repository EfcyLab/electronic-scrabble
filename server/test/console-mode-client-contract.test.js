/**
 * Electronic Scrabble dedicated-console client contract tests.
 *
 * Guards the kiosk screen auto-selection flow and administrator power controls.
 *
 * @author Electronic Scrabble Project
 * @version 1.0.0
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const screenHtml = fs.readFileSync(
    path.resolve(__dirname, '../../screen/index.html'),
    'utf8'
);
const adminHtml = fs.readFileSync(
    path.resolve(__dirname, '../../admin/index.html'),
    'utf8'
);
const serverSource = fs.readFileSync(
    path.resolve(__dirname, '../server.js'),
    'utf8'
);

test('dedicated screen can connect without a game code', () => {
    assert.match(screenHtml, /const consoleMode = parameters\.get\('console'\) === '1';/);
    assert.match(screenHtml, /type: 'watch-console'/);
    assert.match(screenHtml, /data\.type === 'console-game-selected'/);
    assert.match(screenHtml, /data\.type === 'console-idle'/);
});

test('server supports dedicated console screen selection', () => {
    assert.match(serverSource, /function watchConsole\(/);
    assert.match(serverSource, /function getConsoleGame\(/);
    assert.match(serverSource, /case 'watch-console':/);
    assert.match(serverSource, /selectGameForConsoleScreens\(game\);/);
});

test('administration exposes confirmed reboot and poweroff controls', () => {
    assert.match(adminHtml, /id="console-reboot"/);
    assert.match(adminHtml, /id="console-poweroff"/);
    assert.match(adminHtml, /window\.confirm\(I18n\.t\(confirmationKey\)\)/);
    assert.match(adminHtml, /type: 'console-system-action'/);
});

test('server authorizes console system actions only from administrator sessions', () => {
    assert.match(serverSource, /session\.role !== 'admin'/);
    assert.match(serverSource, /CONSOLE_CONTROL_DISABLED/);
    assert.match(serverSource, /validateConsoleAction\(message\.action\)/);
    assert.match(serverSource, /persistAllGames\(\);/);
});


test('dedicated screen loads autonomous Wi-Fi details and player QR codes', () => {
    assert.match(screenHtml, /id="join-card"/);
    assert.match(screenHtml, /id="wifi-qr"/);
    assert.match(screenHtml, /id="player-qr"/);
    assert.match(screenHtml, /fetch\('\/api\/console-network'/);
    assert.match(screenHtml, /\/api\/qr\/player\.svg\?game=/);
});
