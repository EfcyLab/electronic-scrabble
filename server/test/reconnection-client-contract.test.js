/**
 * Electronic Scrabble reconnecting-client contract tests.
 *
 * Guards recovery behavior required after a server or Raspberry Pi restart.
 *
 * @author Electronic Scrabble Project
 * @version 1.0.0
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

/**
 * Reads an application HTML page.
 *
 * @param {string} application Application directory name.
 *
 * @returns {string} HTML source.
 */
function readApplication(application) {
    return fs.readFileSync(
        path.resolve(__dirname, `../../${application}/index.html`),
        'utf8'
    );
}

test('all interactive applications use the reconnecting WebSocket wrapper', () => {
    ['admin', 'player', 'screen'].forEach((application) => {
        const html = readApplication(application);

        assert.match(
            html,
            /reconnecting-websocket\.js/,
            `${application} must load the reconnecting WebSocket wrapper.`
        );
        assert.match(
            html,
            /ElectronicScrabbleReconnectingWebSocket/,
            `${application} must instantiate the reconnecting WebSocket wrapper.`
        );
    });
});

test('player reconnects using the current or initial game code', () => {
    const html = readApplication('player');

    assert.match(
        html,
        /const resumableGameCode = currentGameCode \|\| initialGameCode;/
    );
    assert.match(html, /type: 'resume-game'/);
});

test('administrator stores and resumes a private administrator token', () => {
    const html = readApplication('admin');

    assert.match(html, /function saveAdminSession\(/);
    assert.match(html, /type: 'resume-admin'/);
    assert.match(html, /data\.adminToken/);
});

test('shared screen re-registers itself whenever its WebSocket opens', () => {
    const html = readApplication('screen');

    assert.match(html, /socket\.addEventListener\('open'/);
    assert.match(html, /type: 'watch-game'/);
});

test('replaced player session disables automatic reconnect on the old device', () => {
    const html = readApplication('player');

    assert.match(html, /if \(data\.type === 'session-replaced'\)/);
    assert.match(html, /socket\.close\(1000, 'Session replaced on another device'\)/);
});
