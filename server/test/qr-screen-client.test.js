/**
 * Electronic Scrabble shared-screen QR client contract tests.
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

test('player QR remains available when autonomous Wi-Fi is disabled', () => {
    assert.doesNotMatch(
        screenHtml,
        /consoleNetwork === null \|\| !consoleNetwork\.accessPointEnabled \|\| !joinWindowOpen/
    );
    assert.match(screenHtml, /playerQr\.src = `\/api\/qr\/player\.svg\?game=/);
});

test('Wi-Fi QR is shown only when the autonomous access point is enabled', () => {
    assert.match(screenHtml, /const accessPointAvailable = consoleNetwork\.accessPointEnabled === true/);
    assert.match(screenHtml, /wifiJoinStep\.hidden = true/);
});
