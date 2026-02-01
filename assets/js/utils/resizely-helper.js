/**
 * /assets/js/utils/resizely-helper.js
 * Helper for interacting with Resizely API
 */

const RESIZELY_API_KEY = "I8wjb7XEvLjuPQW4d7o947awiByDEKF5";

/**
 * Generate Resizely URL
 * @param {string} url - Source image URL
 * @param {number} width - Target width
 * @returns {string} Resizely API URL
 */
export function getResizelyUrl(url, width) {
    if (!url || !width) return null;
    // ensure url is encoded if needed, though resizely usually takes raw url at end
    // Pattern: https://api.resizely.net/KEY/w=WIDTH:out=webp/URL
    return `https://api.resizely.net/${RESIZELY_API_KEY}/w=${width}:out=webp/${url}`;
}
