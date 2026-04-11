const { getMessage } = require("./message");
const { getNumbers } = require("./numbers");

async function makeCalls() {
    const numbers = getNumbers();
    if (!numbers.length) {
        return {
            ok: false,
            error:
                "No phone numbers configured. Set CALL_NUMBERS in .env (comma-separated E.164 values)."
        };
    }

    const message = getMessage();

    for (const num of numbers) {
        console.log(`[simulated] call ${num}: ${message.slice(0, 80)}${message.length > 80 ? "…" : ""}`);
        await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    return { ok: true, count: numbers.length };
}

module.exports = makeCalls;
