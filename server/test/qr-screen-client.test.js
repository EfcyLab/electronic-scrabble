/**
 * Electronic Scrabble shared-screen QR client contract tests.
 *
 * @author Electronic Scrabble Project
 * @version 2.0.0
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const screenHtml = fs.readFileSync(
    path.resolve(__dirname, '../../screen/index.html'),
    'utf8'
);

test('player QR remains available when autonomous Wi-Fi is disabled', () => {
    assert.doesNotMatch(
        screenHtml,
        /consoleNetwork === null \|\| !consoleNetwork\.accessPointEnabled \|\| !joinWindowOpen/
    );
    assert.match(screenHtml, /playerQr\.src = `\/api\/qr\/player\.svg\?game=/);
});

test('Wi-Fi QR depends on configured credentials rather than Raspberry Pi access-point mode', () => {
    assert.match(screenHtml, /const wifiQrAvailable = consoleNetwork\.wifiConfigured === true/);
    assert.match(screenHtml, /wifiQrUnavailable\.hidden = false/);
});
