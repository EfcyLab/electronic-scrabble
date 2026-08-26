/**
 * Electronic Scrabble player client contract tests.
 *
 * Guards critical browser-side event handlers against accidental omission.
 *
 * @version 0.1.0
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const playerHtmlPath = path.resolve(__dirname, '../../player/index.html');
const playerHtml = fs.readFileSync(playerHtmlPath, 'utf8');

test('challenge action handler is defined before it is registered', () => {
    const definitionIndex = playerHtml.indexOf('function challengePendingMove()');
    const registrationIndex = playerHtml.indexOf(
        "challengeMoveButton.addEventListener('click', challengePendingMove)"
    );

    assert.ok(definitionIndex >= 0, 'challengePendingMove must be defined.');
    assert.ok(registrationIndex >= 0, 'challengePendingMove must be registered.');
    assert.ok(definitionIndex < registrationIndex, 'challengePendingMove must be defined before registration.');
});

test('pending move acceptance handler is defined before it is registered', () => {
    const definitionIndex = playerHtml.indexOf('function acceptPendingMove()');
    const registrationIndex = playerHtml.indexOf(
        "acceptPendingMoveButton.addEventListener('click', acceptPendingMove)"
    );

    assert.ok(definitionIndex >= 0, 'acceptPendingMove must be defined.');
    assert.ok(registrationIndex >= 0, 'acceptPendingMove must be registered.');
    assert.ok(definitionIndex < registrationIndex, 'acceptPendingMove must be defined before registration.');
});
