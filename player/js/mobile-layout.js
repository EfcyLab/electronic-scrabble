/**
 * Electronic Scrabble mobile layout utilities.
 *
 * Provides deterministic sizing helpers used to keep all seven rack tiles
 * visible in portrait mode without horizontal scrolling.
 *
 * @author Electronic Scrabble Project
 * @version 1.0.0
 */
(function exposeMobileLayout(root, factory) {
    const api = factory();

    if (typeof module === 'object' && module.exports) {
        module.exports = api;
        return;
    }

    root.ElectronicScrabbleMobileLayout = api;
})(typeof window !== 'undefined' ? window : globalThis, function createMobileLayout() {
    /**
     * Returns an adaptive rack gap for a given container width.
     *
     * Very narrow portrait layouts use no gap so seven tiles can still reach
     * a practical touch size without overflowing the viewport.
     *
     * @param {number} containerWidth Available rack width in CSS pixels.
     *
     * @returns {number} Gap between adjacent tiles in CSS pixels.
     */
    function calculateRackGap(containerWidth) {
        if (!Number.isFinite(containerWidth) || containerWidth <= 0) {
            return 0;
        }

        if (containerWidth < 330) {
            return 0;
        }

        if (containerWidth < 430) {
            return 2;
        }

        return 6;
    }

    /**
     * Calculates a tile size that guarantees the complete rack fits.
     *
     * @param {number} containerWidth Available rack width in CSS pixels.
     * @param {number} tileCount Number of rack slots.
     * @param {number} gap Gap between adjacent tiles in CSS pixels.
     * @param {number} maximumTileSize Maximum tile edge length.
     *
     * @returns {number} Tile edge length in CSS pixels.
     */
    function calculateRackTileSize(
        containerWidth,
        tileCount = 7,
        gap = 0,
        maximumTileSize = 72
    ) {
        if (
            !Number.isFinite(containerWidth) ||
            containerWidth <= 0 ||
            !Number.isInteger(tileCount) ||
            tileCount <= 0
        ) {
            return 0;
        }

        const normalizedGap = Number.isFinite(gap) && gap > 0 ? gap : 0;
        const totalGap = normalizedGap * Math.max(0, tileCount - 1);
        const availableWidth = Math.max(0, containerWidth - totalGap);
        const calculatedSize = availableWidth / tileCount;

        return Math.min(maximumTileSize, calculatedSize);
    }

    /**
     * Returns a useful focus coordinate for the occupied board area.
     *
     * @param {Array<Object>} cells Public board cells.
     * @param {number} defaultRow Default row when the board is empty.
     * @param {number} defaultColumn Default column when the board is empty.
     *
     * @returns {{row: number, column: number}} Suggested focus coordinate.
     */
    function calculateBoardFocus(cells, defaultRow = 7, defaultColumn = 7) {
        const occupiedCells = Array.isArray(cells)
            ? cells.filter((cell) => cell?.tile !== null && cell?.tile !== undefined)
            : [];

        if (occupiedCells.length === 0) {
            return {
                row: defaultRow,
                column: defaultColumn
            };
        }

        const totals = occupiedCells.reduce((accumulator, cell) => ({
            row: accumulator.row + cell.row,
            column: accumulator.column + cell.column
        }), {
            row: 0,
            column: 0
        });

        return {
            row: Math.round(totals.row / occupiedCells.length),
            column: Math.round(totals.column / occupiedCells.length)
        };
    }

    return Object.freeze({
        calculateRackGap,
        calculateRackTileSize,
        calculateBoardFocus
    });
});
