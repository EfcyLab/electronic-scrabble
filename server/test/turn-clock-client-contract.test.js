/**
 * Electronic Scrabble turn-clock client contract tests.
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

test('shared screen contains a dedicated turn-clock display', () => {
    assert.match(screenHtml, /id="turn-clock-card"/);
    assert.match(screenHtml, /id="turn-clock-value"/);
    assert.match(screenHtml, /function renderTurnClock\(\)/);
});

test('administrator can configure elapsed, countdown, or disabled clock modes', () => {
    assert.match(adminHtml, /value="elapsed"/);
    assert.match(adminHtml, /value="countdown:120"/);
    assert.match(adminHtml, /value="off"/);
    assert.match(adminHtml, /type: 'configure-turn-clock'/);
});

test('server publishes the turn clock and resets it when advancing the turn', () => {
    assert.match(serverSource, /turnClock: getPublicTurnClock\(game\.turnClock\)/);
    assert.match(serverSource, /game\.turnNumber \+= 1;\s+resetTurnClock\(game\.turnClock\);/);
});
