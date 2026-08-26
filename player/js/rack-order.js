/**
 * Electronic Scrabble rack ordering utilities.
 *
 * Provides deterministic, side-effect-free helpers for preserving,
 * rearranging, and shuffling a player's private rack locally.
 *
 * Rack order is a presentation preference only and never affects the
 * authoritative server-side game state.
 *
 * @author Electronic Scrabble Project
 * @version 0.9.0
 */

(function initializeRackOrderModule(root, factory) {
    const api = factory();

    if (typeof module === 'object' && module.exports) {
        module.exports = api;
        return;
    }

    root.ElectronicScrabbleRackOrder = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, () => {
    /**
     * Returns a rack reordered according to a stored tile identifier list.
     *
     * Unknown stored identifiers are discarded. New rack tiles that are not
     * present in the stored order are appended in their server-provided order.
     *
     * @param {Array<Object>} rack Current private rack.
     * @param {Array<string>} storedOrder Stored tile identifier order.
     *
     * @returns {Array<Object>} Reordered rack copy.
     */
    function reconcileRackOrder(rack, storedOrder) {
        if (!Array.isArray(rack)) {
            return [];
        }

        const rackById = new Map(
            rack.map((tile) => [tile.id, tile])
        );

        const orderedIds = [];
        const seenIds = new Set();

        if (Array.isArray(storedOrder)) {
            storedOrder.forEach((tileId) => {
                if (!rackById.has(tileId) || seenIds.has(tileId)) {
                    return;
                }

                seenIds.add(tileId);
                orderedIds.push(tileId);
            });
        }

        rack.forEach((tile) => {
            if (seenIds.has(tile.id)) {
                return;
            }

            seenIds.add(tile.id);
            orderedIds.push(tile.id);
        });

        return orderedIds.map((tileId) => rackById.get(tileId));
    }

    /**
     * Moves a tile to an absolute rack index.
     *
     * @param {Array<Object>} rack Current private rack.
     * @param {string} tileId Tile identifier to move.
     * @param {number} targetIndex Requested target index.
     *
     * @returns {Array<Object>} Reordered rack copy.
     */
    function moveRackTile(rack, tileId, targetIndex) {
        if (!Array.isArray(rack) || rack.length === 0) {
            return [];
        }

        const currentIndex = rack.findIndex((tile) => tile.id === tileId);

        if (currentIndex === -1) {
            return rack.slice();
        }

        const normalizedTargetIndex = Math.max(
            0,
            Math.min(rack.length - 1, Number.isFinite(targetIndex) ? targetIndex : currentIndex)
        );

        if (currentIndex === normalizedTargetIndex) {
            return rack.slice();
        }

        const reorderedRack = rack.slice();
        const [tile] = reorderedRack.splice(currentIndex, 1);

        reorderedRack.splice(normalizedTargetIndex, 0, tile);

        return reorderedRack;
    }

    /**
     * Moves a tile left or right by a relative offset.
     *
     * @param {Array<Object>} rack Current private rack.
     * @param {string} tileId Tile identifier to move.
     * @param {number} offset Relative index offset.
     *
     * @returns {Array<Object>} Reordered rack copy.
     */
    function moveRackTileByOffset(rack, tileId, offset) {
        if (!Array.isArray(rack)) {
            return [];
        }

        const currentIndex = rack.findIndex((tile) => tile.id === tileId);

        if (currentIndex === -1) {
            return rack.slice();
        }

        return moveRackTile(rack, tileId, currentIndex + offset);
    }

    /**
     * Rebuilds rack order from a list of tile identifiers.
     *
     * @param {Array<Object>} rack Current private rack.
     * @param {Array<string>} orderedIds Tile identifiers in desired order.
     *
     * @returns {Array<Object>} Reordered rack copy.
     */
    function orderRackByIds(rack, orderedIds) {
        return reconcileRackOrder(rack, orderedIds);
    }

    /**
     * Returns the insertion index for a horizontal pointer position.
     *
     * The centers array must describe the non-dragged rack tiles from left
     * to right. Returning centers.length means append after the last tile.
     *
     * @param {number} pointerX Pointer horizontal coordinate.
     * @param {Array<number>} centers Horizontal center coordinates.
     *
     * @returns {number} Insertion index.
     */
    function getRackInsertionIndex(pointerX, centers) {
        if (!Number.isFinite(pointerX) || !Array.isArray(centers)) {
            return 0;
        }

        for (let index = 0; index < centers.length; index += 1) {
            if (pointerX < centers[index]) {
                return index;
            }
        }

        return centers.length;
    }

    /**
     * Returns a shuffled copy of the rack using Fisher-Yates.
     *
     * @param {Array<Object>} rack Current private rack.
     * @param {Function} random Random number generator returning [0, 1).
     *
     * @returns {Array<Object>} Shuffled rack copy.
     */
    function shuffleRack(rack, random = Math.random) {
        if (!Array.isArray(rack)) {
            return [];
        }

        const shuffledRack = rack.slice();

        for (let index = shuffledRack.length - 1; index > 0; index -= 1) {
            const randomValue = Number(random());
            const normalizedRandom = Number.isFinite(randomValue)
                ? Math.max(0, Math.min(0.999999999999, randomValue))
                : 0;
            const targetIndex = Math.floor(normalizedRandom * (index + 1));

            [shuffledRack[index], shuffledRack[targetIndex]] = [
                shuffledRack[targetIndex],
                shuffledRack[index]
            ];
        }

        return shuffledRack;
    }

    return Object.freeze({
        getRackInsertionIndex,
        moveRackTile,
        moveRackTileByOffset,
        orderRackByIds,
        reconcileRackOrder,
        shuffleRack
    });
});
