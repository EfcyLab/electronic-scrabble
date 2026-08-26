/**
 * Electronic Scrabble player board control layout tests.
 *
 * Guards the zoom control bar against narrow columns and verbose status text.
 *
 * @version 0.1.0
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const playerHtml = fs.readFileSync(
    path.resolve(__dirname, '../../player/index.html'),
    'utf8'
);

const playerCss = fs.readFileSync(
    path.resolve(__dirname, '../../player/css/player.css'),
    'utf8'
);

test('board zoom controls reserve the third fixed column for zoom in', () => {
    assert.match(
        playerCss,
        /grid-template-columns:\s*46px minmax\(0, 1fr\) 46px auto;/
    );
});

test('board zoom status cannot wrap into a vertical label', () => {
    assert.match(
        playerCss,
        /#board-zoom-status\s*\{[^}]*white-space:\s*nowrap;/s
    );
});

test('visible board zoom status is compact while retaining an accessible label', () => {
    assert.match(
        playerHtml,
        /boardZoomStatus\.textContent = `\$\{zoomPercent\}%`;/
    );
    assert.match(
        playerHtml,
        /boardZoomStatus\.setAttribute\('aria-label', zoomLabel\);/
    );
});

test('player stylesheet is versioned to invalidate browser cache', () => {
    assert.match(
        playerHtml,
        /\.\/css\/player\.css\?v=14\.2\.0/
    );
});
