const generateResponse = require("./aiService");
const generateVoice = require("./ttsService");
const makeRealCall = require("./twilioService");
const { getNumbers } = require("./numbers");
const customerSupportPrompt = require("./prompt");

async function makeCalls() {
    console.log("makeCalls function started");
    const numbers = getNumbers();
    if (!numbers.length) {
        throw new Error("No CALL_NUMBERS found in .env");
    }

    console.log("Numbers:", numbers);
    console.log("Starting call process...");

    // Step 1 — Generate AI message using full prompt
    const aiMessage = await generateResponse(customerSupportPrompt);

    console.log("AI Message:");
    console.log(aiMessage);

    // Step 2 — Generate voice file locally
    await generateVoice(aiMessage);

    // Step 3 — Make calls using Twilio
    let initiated = 0;
    let failed = 0;
    for (const number of numbers) {
        console.log("Calling:", number);

        try {
            // Make real call
            await makeRealCall(number);
            initiated += 1;
            console.log("Call initiated:", number);
        } catch (error) {
            failed += 1;
            console.error(`Call failed for ${number}:`, error.message);
        }

        await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    console.log("All calls processed.");
    return {
        attempted: numbers.length,
        initiated,
        failed
    };
}

module.exports = makeCalls;