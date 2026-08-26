/**
 * Electronic Scrabble administrator stop-game client contract tests.
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

test('administrator interface exposes a confirmed stop-game action', () => {
    assert.match(adminHtml, /id="stop-game"/);
    assert.match(adminHtml, /admin\.confirmStopGame/);
    assert.match(adminHtml, /type:\s*'stop-game'/);
});

test('administrator renders stopped game state', () => {
    assert.match(adminHtml, /stopped:\s*'common\.stopped'/);
    assert.match(adminHtml, /admin\.stoppedHelp/);
});
