const gTTS = require("gtts");

const GTTS_LANGUAGE_BY_AGENT_LANGUAGE = {
    en: "en",
    hi: "hi",
    te: "te",
    ta: "ta",
    kn: "kn"
};

function generateVoice(message, agentLanguage = "en", filePath = "output.mp3") {
    return new Promise((resolve, reject) => {
        const gttsLanguage = GTTS_LANGUAGE_BY_AGENT_LANGUAGE[agentLanguage] || "en";

        const tts = new gTTS(message, gttsLanguage);

        tts.save(filePath, function (err) {
            if (err) {
                console.error("Voice error:", err);
                reject(err);
            } else {
                console.log(`Voice file created: ${filePath} (lang: ${gttsLanguage})`);
                resolve(filePath);
            }
        });
    });
}

module.exports = generateVoice;