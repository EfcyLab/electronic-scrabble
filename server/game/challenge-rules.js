/**
 * Electronic Scrabble challenge scoring rules.
 *
 * @author Electronic Scrabble Project
 * @version 0.20.0
 */

const UNSUCCESSFUL_CHALLENGE_PENALTY = 5;

/**
 * Applies the penalty for an unsuccessful word challenge.
 *
 * @param {Object} player Challenging player.
 *
 * @returns {number} Applied penalty value.
 */
function applyUnsuccessfulChallengePenalty(player) {
    if (!player || !Number.isFinite(player.score)) {
        throw new TypeError('A challenging player with a numeric score is required.');
    }

    player.score -= UNSUCCESSFUL_CHALLENGE_PENALTY;

    return UNSUCCESSFUL_CHALLENGE_PENALTY;
}

module.exports = {
    UNSUCCESSFUL_CHALLENGE_PENALTY,
    applyUnsuccessfulChallengePenalty
};
