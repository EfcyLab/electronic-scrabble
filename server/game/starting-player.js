/**
 * Electronic Scrabble starting-player draw utilities.
 *
 * Determines the first player using the francophone classic Scrabble rule:
 * every player draws a non-blank tile, the letter closest to A wins, blanks
 * are redrawn, and equal best letters trigger another draw between tied
 * players. All drawn tiles are returned to the bag afterward.
 *
 * @author Electronic Scrabble Project
 * @version 1.0.0
 */

const {
    drawTiles,
    returnTilesToBag
} = require('./french-tiles');

/**
 * Draws one non-blank tile for a player while retaining any blank tiles
 * outside the bag until the complete starting-player draw has finished.
 *
 * @param {Array<Object>} bag Mutable tile bag.
 * @param {Array<Object>} heldTiles Tiles temporarily removed from the bag.
 *
 * @returns {{tile: Object, blankRedraws: number}} Draw result.
 */
function drawStartingLetter(bag, heldTiles) {
    let blankRedraws = 0;

    while (bag.length > 0) {
        const [tile] = drawTiles(bag, 1);

        if (!tile) {
            break;
        }

        heldTiles.push(tile);

        if (!tile.isBlank) {
            return {
                tile,
                blankRedraws
            };
        }

        blankRedraws += 1;
    }

    throw new Error('The tile bag does not contain a non-blank tile for the starting-player draw.');
}

/**
 * Returns the alphabetically closest letter to A from a draw round.
 *
 * @param {Array<Object>} draws Public round draw entries.
 *
 * @returns {string} Winning letter for the round.
 */
function getBestRoundLetter(draws) {
    return draws
        .map((draw) => draw.letter)
        .sort((left, right) => left.localeCompare(right, 'en'))[0];
}

/**
 * Rotates a player order so the selected first player becomes index zero.
 *
 * The relative join order is preserved for every other player.
 *
 * @param {Array<string>} playerIds Player IDs in table/join order.
 * @param {string} startingPlayerId Selected first-player ID.
 *
 * @returns {Array<string>} Rotated turn order.
 */
function rotateTurnOrder(playerIds, startingPlayerId) {
    const startingIndex = playerIds.indexOf(startingPlayerId);

    if (startingIndex < 0) {
        throw new Error('The starting player must exist in the player order.');
    }

    return [
        ...playerIds.slice(startingIndex),
        ...playerIds.slice(0, startingIndex)
    ];
}

/**
 * Determines the first player and returns every drawn tile to the bag.
 *
 * @param {Array<Object>} bag Mutable shuffled tile bag.
 * @param {Array<Object>} players Players in table/join order.
 *
 * @returns {Object} Public starting-player draw result.
 */
function determineStartingPlayer(bag, players) {
    if (!Array.isArray(players) || players.length < 2) {
        throw new Error('At least two players are required for the starting-player draw.');
    }

    const heldTiles = [];
    const rounds = [];
    let candidates = [...players];
    let roundNumber = 1;
    let winner = null;

    try {
        while (winner === null) {
            const draws = candidates.map((player) => {
                const result = drawStartingLetter(bag, heldTiles);

                return {
                    playerId: player.id,
                    playerName: player.name,
                    letter: result.tile.letter,
                    blankRedraws: result.blankRedraws
                };
            });

            const bestLetter = getBestRoundLetter(draws);
            const tiedDraws = draws.filter(
                (draw) => draw.letter === bestLetter
            );

            rounds.push({
                round: roundNumber,
                draws,
                bestLetter,
                tiedPlayerIds: tiedDraws.length > 1
                    ? tiedDraws.map((draw) => draw.playerId)
                    : []
            });

            if (tiedDraws.length === 1) {
                winner = candidates.find(
                    (player) => player.id === tiedDraws[0].playerId
                );
                break;
            }

            const tiedIds = new Set(
                tiedDraws.map((draw) => draw.playerId)
            );

            candidates = candidates.filter(
                (player) => tiedIds.has(player.id)
            );

            roundNumber += 1;
        }
    } finally {
        returnTilesToBag(bag, heldTiles);
    }

    return {
        rounds,
        startingPlayerId: winner.id,
        startingPlayerName: winner.name,
        returnedTileCount: heldTiles.length
    };
}

module.exports = {
    determineStartingPlayer,
    drawStartingLetter,
    getBestRoundLetter,
    rotateTurnOrder
};
