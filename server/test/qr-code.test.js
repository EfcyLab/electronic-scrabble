/**
 * Electronic Scrabble QR renderer tests.
 *
 * @author Electronic Scrabble Project
 * @version 1.0.0
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { renderQrSvg } = require('../qr/qr-code');

test('QR renderer invokes a local executable and returns SVG output', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'electronic-scrabble-qr-'));
    const executable = path.join(directory, 'fake-qrencode');

    fs.writeFileSync(executable, '#!/bin/sh\nprintf \'<svg viewBox="0 0 1 1"></svg>\'\n');
    fs.chmodSync(executable, 0o755);

    try {
        const svg = await renderQrSvg('http://10.42.0.1:8000/player/?game=ABCD', {
            executable
        });

        assert.match(svg, /<svg/);
    } finally {
        fs.rmSync(directory, { recursive: true, force: true });
    }
});

test('QR renderer refuses empty or excessively large payloads', async () => {
    await assert.rejects(() => renderQrSvg(''), /payload is required/);
    await assert.rejects(() => renderQrSvg('x'.repeat(3000)), /too long/);
});
