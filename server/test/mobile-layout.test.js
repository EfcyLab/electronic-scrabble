/**
 * Electronic Scrabble mobile gameplay layout tests.
 *
 * Verifies portrait rack sizing for the compact player interface.
 *
 * @author Electronic Scrabble Project
 * @version 1.1.0
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const MobileLayout = require(path.resolve(
    __dirname,
    '../../player/js/mobile-layout.js'
));

test('very narrow rack layouts remove inter-tile gaps', () => {
    assert.equal(MobileLayout.calculateRackGap(320), 0);
});

test('portrait rack layouts use a compact gap', () => {
    assert.equal(MobileLayout.calculateRackGap(360), 2);
});

test('seven rack tiles always fit inside the available portrait width', () => {
    const width = 312;
    const gap = MobileLayout.calculateRackGap(width);
    const tileSize = MobileLayout.calculateRackTileSize(width, 7, gap, 72);
    const renderedWidth = (tileSize * 7) + (gap * 6);

    assert.ok(renderedWidth <= width + Number.EPSILON);
});

test('rack tiles do not grow beyond the desktop maximum size', () => {
    assert.equal(
        MobileLayout.calculateRackTileSize(900, 7, 6, 72),
        72
    );
});

