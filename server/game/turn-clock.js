/**
 * Electronic Scrabble turn clock utilities.
 *
 * Keeps turn timing authoritative on the server while allowing clients to
 * render the clock locally between synchronized game-state messages.
 *
 * @author Electronic Scrabble Project
 * @version 1.0.0
 */

const CLOCK_MODE_OFF = 'off';
const CLOCK_MODE_ELAPSED = 'elapsed';
const CLOCK_MODE_COUNTDOWN = 'countdown';
const DEFAULT_COUNTDOWN_SECONDS = 120;
const SUPPORTED_CLOCK_MODES = new Set([
    CLOCK_MODE_OFF,
    CLOCK_MODE_ELAPSED,
    CLOCK_MODE_COUNTDOWN
]);

/**
 * Validates and normalizes a clock duration.
 *
 * @param {number} durationSeconds Requested duration in seconds.
 *
 * @returns {number} Normalized duration in seconds.
 */
function normalizeDuration(durationSeconds) {
    const value = Number.parseInt(durationSeconds, 10);

    if (!Number.isFinite(value) || value < 10 || value > 3600) {
        return DEFAULT_COUNTDOWN_SECONDS;
    }

    return value;
}

/**
 * Creates a new turn clock.
 *
 * @param {Object} options Clock options.
 * @param {string} options.mode Clock mode.
 * @param {number} options.durationSeconds Countdown duration.
 *
 * @returns {Object} Mutable turn clock.
 */
function createTurnClock({
    mode = CLOCK_MODE_ELAPSED,
    durationSeconds = DEFAULT_COUNTDOWN_SECONDS
} = {}) {
    const normalizedMode = SUPPORTED_CLOCK_MODES.has(mode)
        ? mode
        : CLOCK_MODE_ELAPSED;

    return {
        mode: normalizedMode,
        durationSeconds: normalizeDuration(durationSeconds),
        elapsedMs: 0,
        startedAt: null
    };
}

/**
 * Reconfigures a turn clock and clears its current timing state.
 *
 * @param {Object} clock Mutable turn clock.
 * @param {string} mode New clock mode.
 * @param {number} durationSeconds Countdown duration.
 *
 * @returns {Object} Updated clock.
 */
function configureTurnClock(clock, mode, durationSeconds) {
    if (!SUPPORTED_CLOCK_MODES.has(mode)) {
        throw new Error(`Unsupported turn clock mode: ${mode}.`);
    }

    clock.mode = mode;
    clock.durationSeconds = normalizeDuration(durationSeconds);
    clock.elapsedMs = 0;
    clock.startedAt = null;

    return clock;
}

/**
 * Returns the total elapsed turn time at a given instant.
 *
 * @param {Object} clock Turn clock.
 * @param {number} now Current Unix timestamp in milliseconds.
 *
 * @returns {number} Elapsed milliseconds.
 */
function getElapsedMs(clock, now = Date.now()) {
    if (clock.startedAt === null) {
        return Math.max(0, clock.elapsedMs);
    }

    return Math.max(0, clock.elapsedMs + (now - clock.startedAt));
}

/**
 * Starts or resumes a clock without clearing accumulated elapsed time.
 *
 * @param {Object} clock Mutable turn clock.
 * @param {number} now Current Unix timestamp in milliseconds.
 *
 * @returns {void}
 */
function resumeTurnClock(clock, now = Date.now()) {
    if (clock.mode === CLOCK_MODE_OFF || clock.startedAt !== null) {
        return;
    }

    clock.startedAt = now;
}

/**
 * Pauses a running turn clock.
 *
 * @param {Object} clock Mutable turn clock.
 * @param {number} now Current Unix timestamp in milliseconds.
 *
 * @returns {void}
 */
function pauseTurnClock(clock, now = Date.now()) {
    if (clock.startedAt === null) {
        return;
    }

    clock.elapsedMs = getElapsedMs(clock, now);
    clock.startedAt = null;
}

/**
 * Resets a clock for a newly started turn.
 *
 * @param {Object} clock Mutable turn clock.
 * @param {number} now Current Unix timestamp in milliseconds.
 *
 * @returns {void}
 */
function resetTurnClock(clock, now = Date.now()) {
    clock.elapsedMs = 0;
    clock.startedAt = clock.mode === CLOCK_MODE_OFF ? null : now;
}

/**
 * Stops and clears a turn clock.
 *
 * @param {Object} clock Mutable turn clock.
 *
 * @returns {void}
 */
function clearTurnClock(clock) {
    clock.elapsedMs = 0;
    clock.startedAt = null;
}

/**
 * Returns a safe public clock state for clients.
 *
 * @param {Object} clock Turn clock.
 * @param {number} now Current Unix timestamp in milliseconds.
 *
 * @returns {Object} Public clock state.
 */
function getPublicTurnClock(clock, now = Date.now()) {
    const elapsedMs = getElapsedMs(clock, now);
    const durationMs = clock.durationSeconds * 1000;

    return {
        mode: clock.mode,
        durationSeconds: clock.durationSeconds,
        elapsedMs,
        running: clock.startedAt !== null,
        expired: (
            clock.mode === CLOCK_MODE_COUNTDOWN &&
            elapsedMs >= durationMs
        )
    };
}

/**
 * Serializes a turn clock for persistent storage.
 *
 * A running clock is converted to accumulated elapsed time so downtime does
 * not count against a player after the server restarts.
 *
 * @param {Object} clock Turn clock.
 * @param {number} now Current Unix timestamp in milliseconds.
 *
 * @returns {Object} Persistent clock snapshot.
 */
function serializeTurnClock(clock, now = Date.now()) {
    return {
        mode: clock.mode,
        durationSeconds: clock.durationSeconds,
        elapsedMs: getElapsedMs(clock, now),
        running: clock.startedAt !== null
    };
}

/**
 * Restores a persistent clock snapshot.
 *
 * @param {Object|null} snapshot Persistent clock snapshot.
 * @param {number} now Current Unix timestamp in milliseconds.
 *
 * @returns {Object} Restored mutable turn clock.
 */
function restoreTurnClock(snapshot, now = Date.now()) {
    if (!snapshot || typeof snapshot !== 'object') {
        return createTurnClock();
    }

    const clock = createTurnClock({
        mode: snapshot.mode,
        durationSeconds: snapshot.durationSeconds
    });

    clock.elapsedMs = Number.isFinite(snapshot.elapsedMs)
        ? Math.max(0, snapshot.elapsedMs)
        : 0;

    if (snapshot.running && clock.mode !== CLOCK_MODE_OFF) {
        clock.startedAt = now;
    }

    return clock;
}

module.exports = {
    CLOCK_MODE_COUNTDOWN,
    CLOCK_MODE_ELAPSED,
    CLOCK_MODE_OFF,
    DEFAULT_COUNTDOWN_SECONDS,
    SUPPORTED_CLOCK_MODES,
    clearTurnClock,
    configureTurnClock,
    createTurnClock,
    getElapsedMs,
    getPublicTurnClock,
    pauseTurnClock,
    resetTurnClock,
    restoreTurnClock,
    resumeTurnClock,
    serializeTurnClock
};
