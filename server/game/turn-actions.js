/**
 * Electronic Scrabble turn action helpers.
 *
 * Validates and applies non-placement turn actions such as tile exchanges.
 * The server remains authoritative over rack ownership and bag contents.
 *
 * @author Electronic Scrabble Project
 * @version 0.6.0
 */

const {
    drawTiles,
    returnTilesToBag
} = require('./french-tiles');

const MIN_EXCHANGE_BAG_SIZE = 7;

class TurnActionError extends Error {
    /**
     * Creates a turn action validation error.
     *
     * @param {string} code Stable protocol error code.
     * @param {string} message Human-readable validation message.
     */
    constructor(code, message) {
        super(message);
        this.name = 'TurnActionError';
        this.code = code;
    }
}

/**
 * Validates tile identifiers submitted for an exchange.
 *
 * @param {Array<Object>} rack Player rack.
 * @param {Array<string>} tileIds Requested private tile identifiers.
 * @param {number} bagSize Number of tiles currently remaining in the bag.
 *
 * @returns {Array<Object>} Trusted rack tiles selected for exchange.
 */
function validateExchangeSelection(rack, tileIds, bagSize) {
    if (bagSize < MIN_EXCHANGE_BAG_SIZE) {
        throw new TurnActionError(
            'NOT_ENOUGH_TILES_TO_EXCHANGE',
            `At least ${MIN_EXCHANGE_BAG_SIZE} tiles must remain in the bag to exchange tiles.`
        );
    }

    if (!Array.isArray(tileIds) || tileIds.length === 0) {
        throw new TurnActionError(
            'EMPTY_EXCHANGE',
            'Select at least one tile to exchange.'
        );
    }

    if (tileIds.length > rack.length) {
        throw new TurnActionError(
            'TOO_MANY_EXCHANGE_TILES',
            'The exchange contains more tiles than the player rack.'
        );
    }

    const rackById = new Map(rack.map((tile) => [tile.id, tile]));
    const uniqueTileIds = new Set();

    return tileIds.map((tileId) => {
        if (typeof tileId !== 'string' || !rackById.has(tileId)) {
            throw new TurnActionError(
                'TILE_NOT_IN_RACK',
                'One of the selected exchange tiles is not available in the player rack.'
            );
        }

        if (uniqueTileIds.has(tileId)) {
            throw new TurnActionError(
                'DUPLICATE_EXCHANGE_TILE',
                'The same rack tile cannot be exchanged twice.'
            );
        }

        uniqueTileIds.add(tileId);

        return rackById.get(tileId);
    });
}

/**
 * Exchanges selected rack tiles using the official draw-before-return order.
 *
 * Replacement tiles are drawn before discarded tiles are returned to the bag,
 * preventing a player from immediately drawing the same physical tile back.
 *
 * @param {Array<Object>} bag Mutable tile bag.
 * @param {Array<Object>} rack Current player rack.
 * @param {Array<string>} tileIds Requested private tile identifiers.
 *
 * @returns {Object} Updated rack and exchange metadata.
 */
function exchangeTiles(bag, rack, tileIds) {
    const discardedTiles = validateExchangeSelection(
        rack,
        tileIds,
        bag.length
    );

    const discardedIds = new Set(
        discardedTiles.map((tile) => tile.id)
    );

    const retainedTiles = rack.filter(
        (tile) => !discardedIds.has(tile.id)
    );

    const replacementTiles = drawTiles(
        bag,
        discardedTiles.length
    );

    returnTilesToBag(bag, discardedTiles);

    return {
        rack: [
            ...retainedTiles,
            ...replacementTiles
        ],
        exchangedCount: discardedTiles.length,
        replacementTiles
    };
}

module.exports = {
    MIN_EXCHANGE_BAG_SIZE,
    TurnActionError,
    exchangeTiles,
    validateExchangeSelection
};
