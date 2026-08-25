/**
 * Electronic Scrabble mobile board navigation utilities.
 *
 * Provides pure calculations for fit-to-screen sizing, board panning,
 * coordinate focusing, and viewport navigation.
 *
 * @author Electronic Scrabble Project
 * @version 1.0.0
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
        const gapsWidth = (boardSize - 1) * gap;
        const availableWidth = viewportSize - (padding * 2) - gapsWidth;

        return Math.max(minimumCellSize, availableWidth / boardSize);
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

    /**
     * Clamps pan offsets so the board remains inside the viewport.
     *
     * @param {number} x Requested horizontal offset.
     * @param {number} y Requested vertical offset.
     * @param {number} renderedBoardSize Rendered board edge length.
     * @param {number} viewportWidth Viewport width.
     * @param {number} viewportHeight Viewport height.
     *
     * @returns {{x: number, y: number}} Clamped pan offsets.
     */
    function clampPan(x, y, renderedBoardSize, viewportWidth, viewportHeight) {
        if (
            renderedBoardSize <= viewportWidth &&
            renderedBoardSize <= viewportHeight
        ) {
            return {
                x: (viewportWidth - renderedBoardSize) / 2,
                y: (viewportHeight - renderedBoardSize) / 2
            };
        }

        return {
            x: Math.min(0, Math.max(viewportWidth - renderedBoardSize, x)),
            y: Math.min(0, Math.max(viewportHeight - renderedBoardSize, y))
        };
    }

    /**
     * Calculates the pan offset required to center a board coordinate.
     *
     * @param {number} row Board row.
     * @param {number} column Board column.
     * @param {number} cellSize Cell size.
     * @param {number} viewportWidth Viewport width.
     * @param {number} viewportHeight Viewport height.
     * @param {number} gap Gap between cells.
     * @param {number} padding Board padding.
     *
     * @returns {{x: number, y: number}} Requested pan offsets.
     */
    function calculateCenteredPan(
        row,
        column,
        cellSize,
        viewportWidth,
        viewportHeight,
        gap = 2,
        padding = 6
    ) {
        const cellCenterX = padding + (column * (cellSize + gap)) + (cellSize / 2);
        const cellCenterY = padding + (row * (cellSize + gap)) + (cellSize / 2);

        return {
            x: (viewportWidth / 2) - cellCenterX,
            y: (viewportHeight / 2) - cellCenterY
        };
    }

    return Object.freeze({
        calculateFitCellSize,
        calculateBoardSize,
        clampPan,
        calculateCenteredPan
    });
});
