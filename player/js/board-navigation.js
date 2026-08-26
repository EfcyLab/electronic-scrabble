/**
 * Electronic Scrabble board sizing utilities.
 *
 * Provides deterministic calculations used to keep the complete 15 × 15
 * board inside the player viewport without zooming or panning.
 *
 * @author Electronic Scrabble Project
 * @version 1.1.0
 */
(function exposeBoardNavigation(root, factory) {
    const api = factory();

    if (typeof module === 'object' && module.exports) {
        module.exports = api;
        return;
    }

    root.ElectronicScrabbleBoardNavigation = api;
})(typeof window !== 'undefined' ? window : globalThis, function createBoardNavigation() {
    /**
     * Calculates a square cell size that fits the full board in a viewport.
     *
     * @param {number} viewportSize Viewport edge length.
     * @param {number} boardSize Number of cells per board edge.
     * @param {number} gap Gap between cells.
     * @param {number} padding Board padding.
     * @param {number} minimumCellSize Minimum cell size.
     *
     * @returns {number} Cell size.
     */
    function calculateFitCellSize(
        viewportSize,
        boardSize = 15,
        gap = 2,
        padding = 6,
        minimumCellSize = 14
    ) {
        const safeViewportSize = Number.isFinite(viewportSize)
            ? Math.max(0, viewportSize)
            : 0;
        const gapsWidth = Math.max(0, boardSize - 1) * gap;
        const availableWidth = safeViewportSize - (padding * 2) - gapsWidth;
        const calculatedSize = boardSize > 0 ? availableWidth / boardSize : 0;

        return Math.max(minimumCellSize, calculatedSize);
    }

    /**
     * Calculates the rendered edge length of a square board.
     *
     * @param {number} cellSize Cell size.
     * @param {number} boardSize Number of cells per edge.
     * @param {number} gap Gap between cells.
     * @param {number} padding Board padding.
     *
     * @returns {number} Rendered board edge length.
     */
    function calculateBoardSize(cellSize, boardSize = 15, gap = 2, padding = 6) {
        return (
            (boardSize * cellSize) +
            ((boardSize - 1) * gap) +
            (padding * 2)
        );
    }

    return Object.freeze({
        calculateFitCellSize,
        calculateBoardSize
    });
});
