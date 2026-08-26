/**
 * Electronic Scrabble QR renderer tests.
 *
 * @author Electronic Scrabble Project
 * @version 2.0.0
 */

const assert = require('node:assert/strict');
const test = require('node:test');
const { renderQrSvg } = require('../qr/qr-code');

test('QR renderer generates SVG through the injected Node.js library', async () => {
    const calls = [];
    const qrLibrary = {
        async toString(payload, options) {
            calls.push({ payload, options });
            return '<svg viewBox="0 0 21 21"></svg>';
        }
    };

    const svg = await renderQrSvg(
        'http://10.42.0.1:8000/player/?game=ABCD',
        { qrLibrary }
    );

    assert.match(svg, /<svg/);
    assert.equal(calls.length, 1);
    assert.equal(
        calls[0].payload,
        'http://10.42.0.1:8000/player/?game=ABCD'
    );
    assert.equal(calls[0].options.type, 'svg');
});

test('QR renderer is independent from the qrencode system executable', () => {
    const source = require('node:fs').readFileSync(
        require('node:path').resolve(__dirname, '../qr/qr-code.js'),
        'utf8'
    );

    assert.doesNotMatch(source, /child_process/);
    assert.doesNotMatch(source, /qrencode/);
    assert.match(source, /require\('qrcode'\)/);
});

test('QR renderer refuses empty or excessively large payloads', async () => {
    const qrLibrary = {
        async toString() {
            return '<svg></svg>';
        }
    };

    await assert.rejects(
        () => renderQrSvg('', { qrLibrary }),
        /payload is required/
    );
    await assert.rejects(
        () => renderQrSvg('x'.repeat(3000), { qrLibrary }),
        /too long/
    );
});
