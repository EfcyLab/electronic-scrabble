/**
 * Electronic Scrabble Milestone 25 player interaction tests.
 *
 * Protects local score-preview parity, blank assignment at placement time,
 * drag feedback, and selected-rack-tile visibility.
 *
 * @author Electronic Scrabble Project
 * @version 0.25.0
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const projectRoot = path.resolve(__dirname, '../..');
const playerHtml = fs.readFileSync(
    path.join(projectRoot, 'player/index.html'),
    'utf8'
);
const playerCss = fs.readFileSync(
    path.join(projectRoot, 'player/css/player.css'),
    'utf8'
);
const MoveScorePreview = require(
    path.join(projectRoot, 'player/js/move-score-preview.js')
);
const {
    createBoard,
    getPublicBoardState
} = require(path.join(projectRoot, 'server/game/board.js'));
const {
    applyMove,
    validateAndScoreMove
} = require(path.join(projectRoot, 'server/game/move-engine.js'));

test('browser move-score preview matches the server for a first move', () => {
    const board = createBoard();
    const rack = [
        { id: 'c', letter: 'C', value: 3, isBlank: false },
        { id: 'a', letter: 'A', value: 1, isBlank: false },
        { id: 't', letter: 'T', value: 1, isBlank: false }
    ];
    const placements = [
        { tileId: 'c', row: 7, column: 7, assignedLetter: null },
        { tileId: 'a', row: 7, column: 8, assignedLetter: null },
        { tileId: 't', row: 7, column: 9, assignedLetter: null }
    ];

    const serverResult = validateAndScoreMove(board, rack, placements);
    const browserResult = MoveScorePreview.validateAndScoreMove(
        getPublicBoardState(board),
        rack,
        placements
    );

    assert.equal(browserResult.score, serverResult.score);
    assert.equal(browserResult.wordScore, serverResult.wordScore);
    assert.deepEqual(
        browserResult.words.map(({ text, score }) => ({ text, score })),
        serverResult.words.map(({ text, score }) => ({ text, score }))
    );
});

test('browser move-score preview matches the server for a connected cross move', () => {
    const board = createBoard();
    const firstRack = [
        { id: 'c', letter: 'C', value: 3, isBlank: false },
        { id: 'a', letter: 'A', value: 1, isBlank: false },
        { id: 't', letter: 'T', value: 1, isBlank: false }
    ];
    const firstMove = validateAndScoreMove(board, firstRack, [
        { tileId: 'c', row: 7, column: 7, assignedLetter: null },
        { tileId: 'a', row: 7, column: 8, assignedLetter: null },
        { tileId: 't', row: 7, column: 9, assignedLetter: null }
    ]);

    applyMove(board, firstMove);

    const rack = [
        { id: 'r', letter: 'R', value: 1, isBlank: false },
        { id: 'e', letter: 'E', value: 1, isBlank: false }
    ];
    const placements = [
        { tileId: 'r', row: 6, column: 8, assignedLetter: null },
        { tileId: 'e', row: 8, column: 8, assignedLetter: null }
    ];
    const serverResult = validateAndScoreMove(board, rack, placements);
    const browserResult = MoveScorePreview.validateAndScoreMove(
        getPublicBoardState(board),
        rack,
        placements
    );

    assert.equal(browserResult.score, serverResult.score);
    assert.deepEqual(
        browserResult.words.map(({ text, score }) => ({ text, score })),
        serverResult.words.map(({ text, score }) => ({ text, score }))
    );
});

test('browser move-score preview matches the server for a blank tile', () => {
    const board = createBoard();
    const rack = [
        { id: 'blank', letter: null, value: 0, isBlank: true },
        { id: 'a', letter: 'A', value: 1, isBlank: false }
    ];
    const placements = [
        { tileId: 'blank', row: 7, column: 7, assignedLetter: 'C' },
        { tileId: 'a', row: 7, column: 8, assignedLetter: null }
    ];
    const serverResult = validateAndScoreMove(board, rack, placements);
    const browserResult = MoveScorePreview.validateAndScoreMove(
        getPublicBoardState(board),
        rack,
        placements
    );

    assert.equal(browserResult.score, serverResult.score);
    assert.equal(browserResult.words[0].text, 'CA');
});

test('blank letter is requested only when the tile is placed on the board', () => {
    assert.doesNotMatch(playerHtml, /id="blank-letter-field"/);
    assert.doesNotMatch(playerHtml, /id="blank-letter"/);
    assert.match(playerHtml, /function requestBlankTileLetter\(\)/);
    assert.match(playerHtml, /window\.prompt\(I18n\.t\('player\.rack\.blankPlacementPrompt'\)/);
    assert.match(playerHtml, /tile\.isBlank\s*\?\s*requestBlankTileLetter\(\)/s);
});

test('rack drag uses a floating ghost and separates board drag from rack reorder', () => {
    assert.match(playerHtml, /function createRackDragGhost\(/);
    assert.match(playerHtml, /function isPointerInsideBoard\(/);
    assert.match(playerHtml, /function isPointerNearRack\(/);
    assert.match(playerCss, /\.rack-drag-ghost\s*\{[^}]*position:\s*fixed;/s);
    assert.match(playerCss, /\.rack-drag-ghost\s*\{[^}]*pointer-events:\s*none;/s);
});

test('selected rack tiles are not clipped by the rack container', () => {
    assert.match(playerCss, /\.rack\s*\{[^}]*overflow:\s*visible;/s);
    assert.match(playerCss, /\.rack\s*\{[^}]*padding-top:\s*0\.55rem;/s);
});
