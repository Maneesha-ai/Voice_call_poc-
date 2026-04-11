/**
 * Phone list from CALL_NUMBERS in .env, comma-separated (e.g. +15551234567,+15559876543).
 */
function getNumbers() {
    const raw = process.env.CALL_NUMBERS;
    if (!raw || typeof raw !== "string") {
        return [];
    }
    return raw.split(",").map((n) => n.trim()).filter(Boolean);
}

module.exports = { getNumbers };
