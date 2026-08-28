/**
 * Electronic Scrabble Milestone 21 client contract tests.
 *
 * Protects the administrator validation controls and the simplified shared
 * screen and player layouts from accidental regression.
 *
 * @author Electronic Scrabble Project
 * @version 0.21.0
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const adminHtml = fs.readFileSync(
    path.resolve(__dirname, '../../admin/index.html'),
    'utf8'
);
const playerHtml = fs.readFileSync(
    path.resolve(__dirname, '../../player/index.html'),
    'utf8'
);
const screenHtml = fs.readFileSync(
    path.resolve(__dirname, '../../screen/index.html'),
    'utf8'
);

test('administrator can choose the word provider and policy for a lobby game', () => {
    assert.match(adminHtml, /id="word-validation-provider"/);
    assert.match(adminHtml, /id="word-validation-policy"/);
    assert.match(adminHtml, /type:\s*'configure-word-validation'/);
    assert.match(adminHtml, /wordValidationProvider:\s*wordValidationProvider\.value/);
    assert.match(adminHtml, /wordValidationPolicy:\s*wordValidationPolicy\.value/);
});

test('player keeps secondary controls in native disclosure panels', () => {
    assert.match(playerHtml, /<details class="player-header-settings">/);
    assert.match(playerHtml, /<details class="player-disclosure precise-placement">/);
    assert.match(playerHtml, /<details class="player-panel player-disclosure player-list-panel">/);
    assert.match(playerHtml, /data-i18n="player\.settings"/);
    assert.match(playerHtml, /data-i18n="player\.precisePlacement"/);
});

test('shared screen prioritizes scoreboard, clock, overview, and last action before lobby join information', () => {
    const scoreboardIndex = screenHtml.indexOf('scoreboard-card');
    const clockIndex = screenHtml.indexOf('turn-clock-card');
    const overviewIndex = screenHtml.indexOf('game-overview-card');
    const lastActionIndex = screenHtml.indexOf('last-action-card');
    const joinIndex = screenHtml.indexOf('join-card');

    assert.ok(scoreboardIndex >= 0);
    assert.ok(clockIndex > scoreboardIndex);
    assert.ok(overviewIndex > clockIndex);
    assert.ok(lastActionIndex > overviewIndex);
    assert.ok(joinIndex > lastActionIndex);
});

test('shared screen hides join QR information once the lobby/start window closes', () => {
    assert.match(
        screenHtml,
        /const joinWindowOpen = \['lobby', 'starting'\]\.includes\(gameStatus\)/
    );
    assert.match(screenHtml, /if \(consoleNetwork === null \|\| !joinWindowOpen\)/);
});
