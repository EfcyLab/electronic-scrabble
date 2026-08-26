/**
 * Electronic Scrabble turn clock tests.
 *
 * @author Electronic Scrabble Project
 * @version 1.0.0
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const {
    CLOCK_MODE_COUNTDOWN,
    CLOCK_MODE_ELAPSED,
    CLOCK_MODE_OFF,
    configureTurnClock,
    createTurnClock,
    getPublicTurnClock,
    pauseTurnClock,
    resetTurnClock,
    restoreTurnClock,
    serializeTurnClock
} = require('../game/turn-clock');

test('elapsed clock starts at zero and accumulates time', () => {
    const clock = createTurnClock({ mode: CLOCK_MODE_ELAPSED });

    resetTurnClock(clock, 1000);

    assert.equal(getPublicTurnClock(clock, 3500).elapsedMs, 2500);
    assert.equal(getPublicTurnClock(clock, 3500).running, true);
});

test('paused clock stops accumulating time', () => {
    const clock = createTurnClock({ mode: CLOCK_MODE_ELAPSED });

    resetTurnClock(clock, 1000);
    pauseTurnClock(clock, 4000);

    assert.equal(getPublicTurnClock(clock, 9000).elapsedMs, 3000);
    assert.equal(getPublicTurnClock(clock, 9000).running, false);
});

test('countdown clock reports expiration without changing game state', () => {
    const clock = createTurnClock({
        mode: CLOCK_MODE_COUNTDOWN,
        durationSeconds: 60
    });

    resetTurnClock(clock, 1000);

    assert.equal(getPublicTurnClock(clock, 60999).expired, false);
    assert.equal(getPublicTurnClock(clock, 61000).expired, true);
});

test('off clock never starts', () => {
    const clock = createTurnClock({ mode: CLOCK_MODE_OFF });

    resetTurnClock(clock, 1000);

    assert.equal(clock.startedAt, null);
    assert.equal(getPublicTurnClock(clock, 10000).elapsedMs, 0);
});

test('clock configuration resets timing state', () => {
    const clock = createTurnClock({ mode: CLOCK_MODE_ELAPSED });

    resetTurnClock(clock, 1000);
    configureTurnClock(clock, CLOCK_MODE_COUNTDOWN, 90);

    assert.equal(clock.mode, CLOCK_MODE_COUNTDOWN);
    assert.equal(clock.durationSeconds, 90);
    assert.equal(clock.elapsedMs, 0);
    assert.equal(clock.startedAt, null);
});

test('restored running clock excludes server downtime', () => {
    const clock = createTurnClock({ mode: CLOCK_MODE_ELAPSED });

    resetTurnClock(clock, 1000);

    const snapshot = serializeTurnClock(clock, 6000);
    const restored = restoreTurnClock(snapshot, 100000);

    assert.equal(getPublicTurnClock(restored, 102000).elapsedMs, 7000);
});
