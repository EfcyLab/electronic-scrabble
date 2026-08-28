/**
 * Electronic Scrabble Milestone 24 player workspace contract tests.
 *
 * Protects the compact board/rack workflow, rack-integrated exchange controls,
 * and authoritative live move-score preview.
 *
 * @author Electronic Scrabble Project
 * @version 0.24.0
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const projectRoot = path.resolve(__dirname, '../..');
const playerHtml = fs.readFileSync(path.join(projectRoot, 'player/index.html'), 'utf8');
const playerCss = fs.readFileSync(path.join(projectRoot, 'player/css/player.css'), 'utf8');
const serverSource = fs.readFileSync(path.join(projectRoot, 'server/server.js'), 'utf8');
const english = require(path.join(projectRoot, 'shared/i18n/en.js'));
const french = require(path.join(projectRoot, 'shared/i18n/fr.js'));

test('precise coordinate placement controls are removed from the player interface', () => {
    assert.doesNotMatch(playerHtml, /id="coordinate-form"/);
    assert.doesNotMatch(playerHtml, /id="coordinate-column"/);
    assert.doesNotMatch(playerHtml, /id="coordinate-row"/);
    assert.doesNotMatch(playerHtml, /id="coordinate-place"/);
    assert.doesNotMatch(playerHtml, /player\.precisePlacement/);
});

test('rack is rendered immediately after the board play surface', () => {
    const moveIndex = playerHtml.indexOf('id="move-section"');
    const boardIndex = playerHtml.indexOf('id="player-board-viewport"');
    const rackIndex = playerHtml.indexOf('id="rack-section"');

    assert.ok(moveIndex >= 0);
    assert.ok(boardIndex > moveIndex);
    assert.ok(rackIndex > boardIndex);
    assert.match(playerCss, /\.gameplay-workspace\s*\{[^}]*gap:\s*0;/s);
    assert.match(playerCss, /\.player-play-surface\s*\{[^}]*border-bottom:\s*0;/s);
});

test('tile exchange controls live inside the rack section', () => {
    const rackStart = playerHtml.indexOf('id="rack-section"');
    const rackEnd = playerHtml.indexOf('id="challenge-section"');
    const exchangeButton = playerHtml.indexOf('id="exchange-mode"');
    const exchangeControls = playerHtml.indexOf('id="exchange-controls"');

    assert.ok(rackStart >= 0);
    assert.ok(rackEnd > rackStart);
    assert.ok(exchangeButton > rackStart && exchangeButton < rackEnd);
    assert.ok(exchangeControls > rackStart && exchangeControls < rackEnd);
});

test('join, game summary, and starting-player information use compact structures', () => {
    assert.match(playerHtml, /id="join-form" class="join-form-compact"/);
    assert.match(playerHtml, /class="player-summary__identity"/);
    assert.doesNotMatch(playerHtml, /id="starting-draw-rounds"/);
    assert.match(playerCss, /#join-form\.join-form-compact\s*\{[^}]*grid-template-columns:/s);
    assert.match(playerCss, /\.starting-draw-section\s*\{[^}]*display:\s*flex;/s);
});

test('player requests and renders authoritative live move score previews', () => {
    assert.match(playerHtml, /id="move-score-preview"/);
    assert.match(playerHtml, /type:\s*'preview-move'/);
    assert.match(playerHtml, /data\.type === 'move-preview'/);
    assert.match(serverSource, /function previewMove\(socket, message\)/);
    assert.match(serverSource, /case 'preview-move':/);
    assert.match(serverSource, /move = validateAndScoreMove|const move = validateAndScoreMove/);
});

test('move score preview labels exist in English and French', () => {
    for (const key of [
        'player.move.previewLabel',
        'player.move.previewScore',
        'player.move.previewUnavailable',
        'player.move.previewCalculating'
    ]) {
        assert.equal(typeof english[key], 'string');
        assert.equal(typeof french[key], 'string');
    }
});
