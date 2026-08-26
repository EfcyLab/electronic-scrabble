/**
 * Electronic Scrabble internationalization tests.
 *
 * Verifies resource-bundle completeness and board terminology translations.
 *
 * @author Electronic Scrabble Project
 * @version 1.0.0
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const english = require(path.resolve(__dirname, '../../shared/i18n/en.js'));
const french = require(path.resolve(__dirname, '../../shared/i18n/fr.js'));
const BoardNavigation = require(path.resolve(
    __dirname,
    '../../player/js/board-navigation.js'
));

test('English and French resource bundles expose the same keys', () => {
    assert.deepEqual(
        Object.keys(french).sort(),
        Object.keys(english).sort()
    );
});

test('French premium-square abbreviations are localized', () => {
    assert.equal(french['premium.DL.short'], 'LD');
    assert.equal(french['premium.TL.short'], 'LT');
    assert.equal(french['premium.DW.short'], 'MD');
    assert.equal(french['premium.TW.short'], 'MT');
});

test('English remains the canonical premium-square terminology', () => {
    assert.equal(english['premium.DL.short'], 'DL');
    assert.equal(english['premium.TL.short'], 'TL');
    assert.equal(english['premium.DW.short'], 'DW');
    assert.equal(english['premium.TW.short'], 'TW');
});

test('mobile board fit calculation keeps the full board inside the viewport', () => {
    const cellSize = BoardNavigation.calculateFitCellSize(360, 15, 2, 6);
    const boardSize = BoardNavigation.calculateBoardSize(cellSize, 15, 2, 6);

    assert.ok(boardSize <= 360.000001);
});


test('turn clock translations are available in English and French', () => {
    assert.equal(english['screen.turnClock'], 'Turn clock');
    assert.equal(english['clock.elapsed'], 'Elapsed time');
    assert.equal(english['screen.clockPlayer'], '{name} · current turn');

    assert.equal(french['screen.turnClock'], 'Chronomètre du tour');
    assert.equal(french['clock.elapsed'], 'Temps écoulé');
    assert.equal(french['screen.clockPlayer'], '{name} · tour en cours');
});

test('application pages cache-bust internationalization resources', () => {
    const fs = require('node:fs');
    const pagePaths = [
        path.resolve(__dirname, '../../admin/index.html'),
        path.resolve(__dirname, '../../player/index.html'),
        path.resolve(__dirname, '../../screen/index.html')
    ];

    for (const pagePath of pagePaths) {
        const source = fs.readFileSync(pagePath, 'utf8');

        assert.match(source, /shared\/i18n\/en\.js\?v=18\.0\.0/);
        assert.match(source, /shared\/i18n\/fr\.js\?v=18\.0\.0/);
        assert.match(source, /shared\/js\/i18n-manager\.js\?v=18\.0\.0/);
    }
});


test('shared-screen autonomous Wi-Fi and QR labels are translated', () => {
    assert.equal(english['screen.joinGame'], 'Join the game');
    assert.equal(english['screen.joinWifi'], 'Connect to Wi-Fi');
    assert.equal(french['screen.joinGame'], 'Rejoindre la partie');
    assert.equal(french['screen.joinWifi'], 'Se connecter au Wi-Fi');
});
