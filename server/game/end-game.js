/**
 * Electronic Scrabble end-game helpers.
 *
 * Detects supported classic-game ending conditions and applies final
 * rack-value adjustments without exposing private rack contents.
 *
 * @author Electronic Scrabble Project
 * @version 0.7.0
 */

const { MIN_EXCHANGE_BAG_SIZE } = require('./turn-actions');

const PASS_ROUNDS_TO_END = 3;
const END_REASON_RACK_EMPTIED = 'rack-emptied';
const END_REASON_CONSECUTIVE_PASSES = 'consecutive-passes';

/**
 * Returns the total face value of the tiles in a rack.
 *
 * Blank tiles contribute zero points.
 *
 * @param {Array<Object>} rack Player rack.
 *
 * @returns {number} Rack value.
 */
function getRackValue(rack) {
    return rack.reduce(
        (total, tile) => total + tile.value,
        0
    );
}

/**
 * Determines whether a move ended the game by emptying a rack
 * after the tile bag became empty.
 *
 * @param {Array<Object>} bag Current tile bag.
 * @param {Array<Object>} rack Current player rack after replenishment.
 *
 * @returns {boolean} True when the rack-empty ending condition is met.
 */
function shouldEndAfterRackEmptied(bag, rack) {
    return bag.length === 0 && rack.length === 0;
}

/**
 * Returns the number of uninterrupted pass actions required to end
 * a blocked game for the current player count.
 *
 * Each player must pass three consecutive turns, which corresponds to
 * three complete rounds of passes.
 *
 * @param {number} playerCount Number of players in the game.
 *
 * @returns {number} Required consecutive pass count.
 */
function getRequiredConsecutivePasses(playerCount) {
    return playerCount * PASS_ROUNDS_TO_END;
}

/**
 * Determines whether a blocked game must end after consecutive passes.
 *
 * The condition is enabled only when fewer than seven tiles remain in
 * the bag, because exchanges are no longer allowed at that point.
 *
 * @param {number} bagSize Number of tiles remaining in the bag.
 * @param {number} consecutivePasses Current uninterrupted pass count.
 * @param {number} playerCount Number of players in the game.
 *
 * @returns {boolean} True when the blocked-game condition is met.
 */
function shouldEndAfterConsecutivePasses(
    bagSize,
    consecutivePasses,
    playerCount
) {
    if (playerCount < 1 || bagSize >= MIN_EXCHANGE_BAG_SIZE) {
        return false;
    }

    return consecutivePasses >= getRequiredConsecutivePasses(playerCount);
}

/**
 * Calculates public final score adjustments for all players.
 *
 * When one player empties the rack with an empty bag, every other
 * player's rack value is deducted from their score and added to the
 * finishing player's score. For a blocked game, every player only
 * deducts their own rack value.
 *
 * @param {Iterable<Object>} players Player collection.
 * @param {string} reason End-game reason.
 * @param {string|null} finishingPlayerId Rack-empty finishing player ID.
 *
 * @returns {Object} Public final result.
 */
function calculateFinalResult(players, reason, finishingPlayerId = null) {
    const playerList = Array.from(players);
    const rackValues = new Map(
        playerList.map((player) => [player.id, getRackValue(player.rack)])
    );

    let finishingBonus = 0;

    if (reason === END_REASON_RACK_EMPTIED) {
        finishingBonus = playerList
            .filter((player) => player.id !== finishingPlayerId)
            .reduce(
                (total, player) => total + rackValues.get(player.id),
                0
            );
    }

    const rankings = playerList.map((player) => {
        const rackValue = rackValues.get(player.id);
        const scoreBeforeAdjustment = player.score;
        const adjustment = -rackValue + (
            player.id === finishingPlayerId &&
            reason === END_REASON_RACK_EMPTIED
                ? finishingBonus
                : 0
        );

        return {
            playerId: player.id,
            playerName: player.name,
            scoreBeforeAdjustment,
            rackValue,
            adjustment,
            finalScore: scoreBeforeAdjustment + adjustment
        };
    });

    rankings.sort((left, right) => {
        if (right.finalScore !== left.finalScore) {
            return right.finalScore - left.finalScore;
        }

        return right.scoreBeforeAdjustment - left.scoreBeforeAdjustment;
    });

    let previousScore = null;
    let previousPosition = 0;

    rankings.forEach((ranking, index) => {
        if (ranking.finalScore !== previousScore) {
            previousPosition = index + 1;
            previousScore = ranking.finalScore;
        }

        ranking.position = previousPosition;
    });

    const winningScore = rankings.length > 0
        ? rankings[0].finalScore
        : null;

    return {
        reason,
        finishingPlayerId,
        winnerIds: rankings
            .filter((ranking) => ranking.finalScore === winningScore)
            .map((ranking) => ranking.playerId),
        rankings
    };
}

/**
 * Applies final score adjustments and marks a game as finished.
 *
 * @param {Object} game Mutable game instance.
 * @param {string} reason End-game reason.
 * @param {string|null} finishingPlayerId Rack-empty finishing player ID.
 *
 * @returns {Object} Public final result.
 */
function finishGame(game, reason, finishingPlayerId = null) {
    const result = calculateFinalResult(
        game.players.values(),
        reason,
        finishingPlayerId
    );

    result.rankings.forEach((ranking) => {
        const player = game.players.get(ranking.playerId);

        if (player) {
            player.score = ranking.finalScore;
        }
    });

    game.status = 'finished';
    game.currentPlayerId = null;
    game.finalResult = result;

    return result;
}

module.exports = {
    END_REASON_CONSECUTIVE_PASSES,
    END_REASON_RACK_EMPTIED,
    PASS_ROUNDS_TO_END,
    calculateFinalResult,
    finishGame,
    getRackValue,
    getRequiredConsecutivePasses,
    shouldEndAfterConsecutivePasses,
    shouldEndAfterRackEmptied
};
