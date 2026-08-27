/**
 * Electronic Scrabble administrator game-management client contract tests.
 *
 * @author Electronic Scrabble Project
 * @version 1.0.0
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const adminHtml = fs.readFileSync(
    path.resolve(__dirname, '../../admin/index.html'),
    'utf8'
);
const serverSource = fs.readFileSync(
    path.resolve(__dirname, '../server.js'),
    'utf8'
);

test('administrator can resume a stopped game', () => {
    assert.match(adminHtml, /id="resume-game"/);
    assert.match(adminHtml, /type:\s*'resume-stopped-game'/);
    assert.match(serverSource, /case 'resume-stopped-game'/);
    assert.match(serverSource, /resumeStoppedGameState\(game\)/);
});

test('administrator history uses locally stored admin tokens', () => {
    assert.match(adminHtml, /id="game-history-list"/);
    assert.match(adminHtml, /type:\s*'list-managed-games'/);
    assert.match(adminHtml, /listSavedAdminSessions\(\)/);
    assert.match(serverSource, /case 'list-managed-games'/);
});

test('administrator can purge terminal persisted games', () => {
    assert.match(adminHtml, /type:\s*'purge-game'/);
    assert.match(serverSource, /\['finished', 'stopped'\]\.includes\(game\.status\)/);
    assert.match(serverSource, /gameStore\.deleteGame\(game\.code\)/);
});
