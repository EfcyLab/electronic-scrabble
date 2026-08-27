/**
 * Electronic Scrabble challenge scoring rule tests.
 *
 * @author Electronic Scrabble Project
 * @version 0.20.0
 */

const assert = require('node:assert/strict');
const test = require('node:test');
const {
    UNSUCCESSFUL_CHALLENGE_PENALTY,
    applyUnsuccessfulChallengePenalty
} = require('../game/challenge-rules');

test('unsuccessful challenge penalty is five points', () => {
    assert.equal(UNSUCCESSFUL_CHALLENGE_PENALTY, 5);
});

test('unsuccessful challenge deducts five points from the challenger', () => {
    const player = {
        score: 3
    };

    const penalty = applyUnsuccessfulChallengePenalty(player);

    assert.equal(penalty, 5);
    assert.equal(player.score, -2);
});
