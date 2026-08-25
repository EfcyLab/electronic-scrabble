/**
 * French Scrabble tile definitions and bag utilities.
 *
 * Provides the standard francophone tile distribution, secure shuffling,
 * and tile drawing helpers used by the Electronic Scrabble server.
 *
 * @author Electronic Scrabble Project
 * @version 0.6.0
 */

const { randomInt, randomUUID } = require('node:crypto');

const RACK_SIZE = 7;
const TOTAL_TILES = 102;

const FRENCH_TILE_DISTRIBUTION = Object.freeze([
    { letter: 'A', value: 1, count: 9 },
    { letter: 'B', value: 3, count: 2 },
    { letter: 'C', value: 3, count: 2 },
    { letter: 'D', value: 2, count: 3 },
    { letter: 'E', value: 1, count: 15 },
    { letter: 'F', value: 4, count: 2 },
    { letter: 'G', value: 2, count: 2 },
    { letter: 'H', value: 4, count: 2 },
    { letter: 'I', value: 1, count: 8 },
    { letter: 'J', value: 8, count: 1 },
    { letter: 'K', value: 10, count: 1 },
    { letter: 'L', value: 1, count: 5 },
    { letter: 'M', value: 2, count: 3 },
    { letter: 'N', value: 1, count: 6 },
    { letter: 'O', value: 1, count: 6 },
    { letter: 'P', value: 3, count: 2 },
    { letter: 'Q', value: 8, count: 1 },
    { letter: 'R', value: 1, count: 6 },
    { letter: 'S', value: 1, count: 6 },
    { letter: 'T', value: 1, count: 6 },
    { letter: 'U', value: 1, count: 6 },
    { letter: 'V', value: 4, count: 2 },
    { letter: 'W', value: 10, count: 1 },
    { letter: 'X', value: 10, count: 1 },
    { letter: 'Y', value: 10, count: 1 },
    { letter: 'Z', value: 10, count: 1 },
    { letter: null, value: 0, count: 2 }
]);

/**
 * Shuffles an array in place using the Fisher-Yates algorithm.
 *
 * @param {Array<*>} items Items to shuffle.
 *
 * @returns {Array<*>} The shuffled array.
 */
function shuffle(items) {
    for (let index = items.length - 1; index > 0; index -= 1) {
        const randomIndex = randomInt(index + 1);
        const currentItem = items[index];

        items[index] = items[randomIndex];
        items[randomIndex] = currentItem;
    }

    return items;
}

/**
 * Creates and shuffles a complete French Scrabble tile bag.
 *
 * @returns {Array<Object>} Shuffled tile bag.
 */
function createFrenchTileBag() {
    const bag = [];

    FRENCH_TILE_DISTRIBUTION.forEach((definition) => {
        for (let index = 0; index < definition.count; index += 1) {
            bag.push({
                id: randomUUID(),
                letter: definition.letter,
                value: definition.value,
                isBlank: definition.letter === null
            });
        }
    });

    if (bag.length !== TOTAL_TILES) {
        throw new Error(
            `Invalid French tile distribution: expected ${TOTAL_TILES} tiles, got ${bag.length}.`
        );
    }

    return shuffle(bag);
}

/**
 * Draws up to the requested number of tiles from a bag.
 *
 * @param {Array<Object>} bag Tile bag.
 * @param {number} count Maximum number of tiles to draw.
 *
 * @returns {Array<Object>} Drawn tiles.
 */
function drawTiles(bag, count) {
    const tiles = [];
    const drawCount = Math.min(Math.max(count, 0), bag.length);

    for (let index = 0; index < drawCount; index += 1) {
        tiles.push(bag.pop());
    }

    return tiles;
}

/**
 * Returns tiles to the bag and securely reshuffles the bag.
 *
 * @param {Array<Object>} bag Mutable tile bag.
 * @param {Array<Object>} tiles Tiles to return.
 *
 * @returns {Array<Object>} Reshuffled tile bag.
 */
function returnTilesToBag(bag, tiles) {
    bag.push(...tiles);

    return shuffle(bag);
}

module.exports = {
    FRENCH_TILE_DISTRIBUTION,
    RACK_SIZE,
    TOTAL_TILES,
    createFrenchTileBag,
    drawTiles,
    returnTilesToBag
};
