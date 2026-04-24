require("dotenv").config();

const express = require("express");
const twilio = require("twilio");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const makeCalls = require("./callService");
const generateResponse = require("./aiService");
const generateVoice = require("./ttsService");
const { getMessage, setMessage } = require("./message");

const app = express();
const port = Number(process.env.PORT) || 3000;
const publicBaseUrl = (process.env.PUBLIC_BASE_URL || "").replace(/\/+$/, "");
const callState = new Map();
const aiPromptCache = new Map();
const GENERATED_AUDIO_DIR = path.join(__dirname, "generated-audio");

if (!fs.existsSync(GENERATED_AUDIO_DIR)) {
    fs.mkdirSync(GENERATED_AUDIO_DIR, { recursive: true });
}
app.use("/audio", express.static(GENERATED_AUDIO_DIR));

function absoluteUrl(pathname) {
    if (!publicBaseUrl) {
        return pathname;
    }
    return `${publicBaseUrl}${pathname}`;
}

const LANGUAGE_BY_DIGIT = {
    "1": "en",
    "2": "hi",
    "3": "te",
    "4": "ta",
    "5": "kn"
};

const LANGUAGE_NAME = {
    en: "English",
    hi: "Hindi",
    te: "Telugu",
    ta: "Tamil",
    kn: "Kannada"
};

const SERVICE_LABELS = {
    "1": "delivery status",
    "2": "damaged or missing item complaint",
    "3": "return or refund request",
    "4": "customer care support"
};

const TWILIO_SAY_OPTIONS_BY_LANGUAGE = {
    en: { voice: "alice", language: "en-IN" },
    hi: { voice: "alice", language: "hi-IN" },
    te: { voice: "alice", language: "en-IN" },
    ta: { voice: "alice", language: "en-IN" },
    kn: { voice: "alice", language: "en-IN" }
};

function getLanguageFromDigit(digit) {
    return LANGUAGE_BY_DIGIT[digit] || null;
}

function getLanguageName(code) {
    return LANGUAGE_NAME[code] || "English";
}

function getLanguageOutputRule(language = "en") {
    const rules = {
        en: "Use only natural English.",
        hi: "Use only Hindi in Devanagari script. Do not use Hinglish or Latin letters.",
        te: "Use only Telugu script. Do not mix English words unless absolutely necessary.",
        ta: "Use only Tamil script. Do not mix English words unless absolutely necessary.",
        kn: "Use only Kannada script. Do not mix English words unless absolutely necessary."
    };
    return rules[language] || rules.en;
}

function getSayOptions(language = "en") {
    return TWILIO_SAY_OPTIONS_BY_LANGUAGE[language] || TWILIO_SAY_OPTIONS_BY_LANGUAGE.en;
}

function shouldUsePlayAudio(language = "en") {
    return ["hi"].includes(language);
}

async function getPlayableAudioUrl(text, language = "en") {
    if (!publicBaseUrl || !shouldUsePlayAudio(language)) {
        return null;
    }

    const hash = crypto
        .createHash("sha1")
        .update(`${language}:${text}`)
        .digest("hex");
    const fileName = `${language}-${hash}.mp3`;
    const filePath = path.join(GENERATED_AUDIO_DIR, fileName);

    if (!fs.existsSync(filePath)) {
        try {
            console.log(`Generating playback audio for language: ${language}`);
            await generateVoice(text, language, filePath);
        } catch (error) {
            console.error(`Playback audio generation failed for ${language}:`, error.message);
            return null;
        }
    }

    return `${publicBaseUrl}/audio/${fileName}`;
}

async function sayText(twiml, text, language = "en") {
    const audioUrl = await getPlayableAudioUrl(text, language);
    if (audioUrl) {
        twiml.play(audioUrl);
        return;
    }
    twiml.say(getSayOptions(language), text);
}

async function gatherSay(gather, text, language = "en") {
    const audioUrl = await getPlayableAudioUrl(text, language);
    if (audioUrl) {
        gather.play(audioUrl);
        return;
    }
    gather.say(getSayOptions(language), text);
}

function getLanguageSelectionPrompt() {
    return "For English press 1. For Hindi press 2. For Telugu press 3. For Tamil press 4. For Kannada press 5.";
}

function getDeterministicStageLine(stage, language = "en") {
    const lines = {
        en: {
            menu: "Please choose an option. Press 1 for delivery status, 2 for damaged or missing item, 3 for return or refund, 4 for customer care.",
            menu_reminder: "Please choose 1, 2, 3, or 4, or speak your issue now.",
            language_selected: "You selected English. Please choose service option 1 to 4.",
            no_input: "I did not hear anything. Please call again when you are ready. Goodbye.",
            not_caught: "Sorry, I did not catch that. Please repeat."
        },
        hi: {
            menu: "Kripya vikalp chuniyega. Delivery status ke liye 1, damaged ya missing item ke liye 2, return ya refund ke liye 3, customer care ke liye 4 dabaiye.",
            menu_reminder: "Kripya 1, 2, 3, ya 4 chuniyega, ya apni samasya boliyega.",
            language_selected: "Aapne Hindi chuni hai. Kripya service option 1 se 4 chuniyega.",
            no_input: "Mujhe kuch sunayi nahi diya. Kripya jab taiyar hon tab dobara call kariye. Dhanyavaad.",
            not_caught: "Maaf kijiye, mujhe samajh nahi aaya. Kripya dobara boliyega."
        },
        te: {
            menu: "Dayachesi option enchukondi. Delivery status kosam 1, damaged leda missing item kosam 2, return leda refund kosam 3, customer care kosam 4 nokkandi.",
            menu_reminder: "Dayachesi 1, 2, 3, leda 4 enchukondi, leda mee problem cheppandi.",
            language_selected: "Meeru Telugu enchukunnaru. Dayachesi service option 1 nundi 4 varaku enchukondi.",
            no_input: "Naku emi vinapadaledu. Dayachesi malli call cheyyandi. Dhanyavadalu.",
            not_caught: "Kshaminchandi, naku ardham kaaledu. Dayachesi malli cheppandi."
        },
        ta: {
            menu: "Dayavu seithu option therindhukollungal. Delivery status-kku 1, damaged allathu missing item-kku 2, return allathu refund-kku 3, customer care-kku 4 azhuthungal.",
            menu_reminder: "Dayavu seithu 1, 2, 3, allathu 4 therindhukollungal, illaiyel ungal pirachanaiyai sollungal.",
            language_selected: "Neenga Tamil therindhukondeergal. Dayavu seithu service option 1 mudhal 4 varai therindhukollungal.",
            no_input: "Enakku ondrum ketkavillai. Dayavu seithu pinnum call pannungal. Nandri.",
            not_caught: "Mannikkavum, enakku puriyavillai. Dayavu seithu marubadiyum sollungal."
        },
        kn: {
            menu: "Dayavittu option ayke madi. Delivery status-ge 1, damaged athava missing item-ge 2, return athava refund-ge 3, customer care-ge 4 otti.",
            menu_reminder: "Dayavittu 1, 2, 3, athava 4 ayke madi, athava nimma samasya heli.",
            language_selected: "Nivu Kannada ayke madiddiri. Dayavittu service option 1 inda 4 varege ayke madi.",
            no_input: "Nanage enu kelisalilla. Dayavittu matte call madi. Dhanyavadagalu.",
            not_caught: "Kshamisi, nanage arthavagalilla. Dayavittu matte heli."
        }
    };
    return lines[language]?.[stage] || lines.en[stage] || "Please continue.";
}

async function getAiTemplateText(cacheKey, fallbackText, prompt, useCache = true) {
    if (useCache && aiPromptCache.has(cacheKey)) {
        return aiPromptCache.get(cacheKey);
    }
    try {
        const text = await generateResponse(prompt);
        const clean = (text || "").trim();
        if (clean) {
            if (useCache) {
                aiPromptCache.set(cacheKey, clean);
            }
            return clean;
        }
    } catch (error) {
        console.error("AI template generation failed:", error.message);
    }
    return fallbackText;
}

async function getAgentLine({ stage, language = "en", menuDigit = "", userInput = "" }) {
    if (["menu", "menu_reminder", "language_selected", "no_input", "not_caught"].includes(stage)) {
        return getDeterministicStageLine(stage, language);
    }

    const languageName = getLanguageName(language);
    const menuLabel = SERVICE_LABELS[menuDigit] || "unknown";
    const cacheKey = `agent-line:${stage}:${language}:${menuDigit}`;
    const fallbackByStage = {
        menu: "Please choose an option. Press 1 for delivery, 2 for damaged or missing item, 3 for return or refund, 4 for customer care.",
        menu_reminder: "You can press 1, 2, 3, or 4, or speak your issue now.",
        language_selected: `You selected ${languageName}. Please choose: 1 delivery, 2 damaged or missing item, 3 return or refund, 4 customer care.`,
        no_input: "I did not hear anything. Please call again when you are ready. Goodbye.",
        not_caught: "Sorry, I did not catch that.",
        followup: "Please share details and your order number. You can start speaking now.",
        service_reply: "Understood. Please share details and your order number."
    };
    const fallbackText = fallbackByStage[stage] || "Please continue.";
    const stageRules = {
        menu: "Clearly list options 1, 2, 3, 4 once.",
        menu_reminder: "Keep very short. Do not list all options again.",
        language_selected: "Confirm chosen language and immediately ask caller to choose service option 1 to 4.",
        no_input: "Politely ask caller to retry or call again.",
        not_caught: "Politely ask caller to repeat.",
        followup: `Tell caller what details to speak next for option ${menuDigit}. Do NOT list menu numbers 1,2,3,4.`,
        service_reply: `Acknowledge option ${menuDigit} briefly. Do NOT list menu numbers 1,2,3,4.`
    };
    const stageRule = stageRules[stage] || "Keep it concise.";
    const useCache = stage === "menu" || stage === "menu_reminder" || stage === "no_input" || stage === "not_caught";
    const prompt = `You are a natural human-like voice call AI agent.
Generate ONLY one spoken sentence in ${languageName}.
Stage: ${stage}
Menu option selected: ${menuDigit || "none"} (${menuLabel})
Latest caller text: ${userInput || "none"}
Rules:
- Keep concise and clear for phone audio.
- Do not include numbering, markdown, labels, or quotes.
- Keep it natural, non-robotic, and easy to understand.
- Stage-specific rule: ${stageRule}
- Language output rule: ${getLanguageOutputRule(language)}
`;
    return getAiTemplateText(cacheKey, fallbackText, prompt, useCache);
}

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use((req, res, next) => {
    console.log(
        `[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`
    );
    next();
});

app.get("/", (req, res) => {
    res.send("Voice Agent Server Running");
});

app.get("/health", (req, res) => {
    res.json({
        ok: true,
        port,
        hasPublicBaseUrl: Boolean(process.env.PUBLIC_BASE_URL)
    });
});

app.post("/set-message", (req, res) => {
    try {
        const userMessage = req.body.message;
        setMessage(userMessage);

        console.log("Message updated:", userMessage);

        res.send("Message saved successfully");
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

app.get("/start-calls", async (req, res) => {
    console.log("START-CALLS endpoint triggered");

    try {
        const result = await makeCalls();

        res.json({
            message: "Calls started",
            attempted: result.attempted,
            initiated: result.initiated,
            failed: result.failed
        });
    } catch (error) {
        console.error("start-calls error:", error.message);

        res.status(500).json({
            error: error.message
        });
    }
});

//
// FIXED ROUTE — accepts both GET and POST
//
app.all("/voice/intro", async (req, res) => {
    console.log("Twilio hit /voice/intro");

    const twiml = new twilio.twiml.VoiceResponse();
    const introMessage = getMessage();

    const gather = twiml.gather({
        input: "speech dtmf",
        action: absoluteUrl("/voice/respond"),
        method: "POST",
        speechTimeout: "auto",
        timeout: 6,
        actionOnEmptyResult: true
    });

    await gatherSay(gather, introMessage, "en");

    await gatherSay(gather, getLanguageSelectionPrompt(), "en");

    await sayText(twiml, await getAgentLine({ stage: "no_input", language: "en" }), "en");

    twiml.hangup();

    res.type("text/xml");
    res.send(twiml.toString());
});

app.all("/voice/menu", async (req, res) => {
    const twiml = new twilio.twiml.VoiceResponse();
    const callSid = (req.body.CallSid || req.query.CallSid || "").trim();
    const selectedLanguage = callSid ? callState.get(callSid)?.language : "en";

    const gather = twiml.gather({
        input: "speech dtmf",
        action: absoluteUrl("/voice/respond"),
        method: "POST",
        speechTimeout: "auto",
        timeout: 6,
        actionOnEmptyResult: true
    });

    const menuPrompt = await getAgentLine({ stage: "menu", language: selectedLanguage });
    await gatherSay(gather, menuPrompt, selectedLanguage);
    if (callSid) {
        callState.set(callSid, { ...(callState.get(callSid) || {}), menuShown: true });
    }

    await sayText(twiml, await getAgentLine({ stage: "no_input", language: selectedLanguage }), selectedLanguage);
    twiml.hangup();

    res.type("text/xml");
    res.send(twiml.toString());
});

app.all("/voice/listen", async (req, res) => {
    const twiml = new twilio.twiml.VoiceResponse();
    const callSid = (req.body.CallSid || req.query.CallSid || "").trim();
    const selectedOption = callSid ? callState.get(callSid)?.menuOption : null;
    const selectedLanguage = callSid ? callState.get(callSid)?.language : "en";

    const gather = twiml.gather({
        input: "speech dtmf",
        action: absoluteUrl("/voice/respond"),
        method: "POST",
        speechTimeout: "auto",
        timeout: 6,
        actionOnEmptyResult: true
    });

    const hasMenuShown = Boolean(callSid && callState.get(callSid)?.menuShown);
    if (selectedOption && ["1", "2", "3", "4"].includes(selectedOption)) {
        await gatherSay(
            gather,
            await getAgentLine({ stage: "followup", language: selectedLanguage, menuDigit: selectedOption }),
            selectedLanguage
        );
    } else {
        await gatherSay(
            gather,
            await getAgentLine({
                stage: hasMenuShown ? "menu_reminder" : "menu",
                language: selectedLanguage
            }),
            selectedLanguage
        );
    }

    await sayText(twiml, await getAgentLine({ stage: "no_input", language: selectedLanguage }), selectedLanguage);
    twiml.hangup();

    res.type("text/xml");
    res.send(twiml.toString());
});

app.post("/voice/respond", async (req, res) => {
    const twiml = new twilio.twiml.VoiceResponse();
    const callSid = (req.body.CallSid || "").trim();
    const currentState = callSid ? callState.get(callSid) || {} : {};
    const selectedLanguage = currentState.language || "en";

    const speechResult = (req.body.SpeechResult || "").trim();
    const dtmfDigits = (req.body.Digits || "").trim();

    const userInput =
        speechResult || dtmfDigits;

    if (!currentState.language) {
        const language = getLanguageFromDigit(dtmfDigits);
        if (language) {
            if (callSid) {
                callState.set(callSid, { ...currentState, language, menuShown: false, menuOption: null });
            }

            await sayText(twiml, await getAgentLine({ stage: "language_selected", language }), language);
            twiml.redirect({ method: "POST" }, absoluteUrl("/voice/menu"));
            res.type("text/xml");
            res.send(twiml.toString());
            return;
        }

        await sayText(twiml, getLanguageSelectionPrompt(), "en");
        twiml.redirect({ method: "POST" }, absoluteUrl("/voice/intro"));
        res.type("text/xml");
        res.send(twiml.toString());
        return;
    }

    if (!userInput) {
        await sayText(twiml, await getAgentLine({ stage: "not_caught", language: selectedLanguage }), selectedLanguage);

        twiml.redirect(
            { method: "POST" },
            absoluteUrl("/voice/listen")
        );

        res.type("text/xml");
        res.send(twiml.toString());
        return;
    }

    if (dtmfDigits) {
        if (callSid && ["1", "2", "3", "4"].includes(dtmfDigits)) {
            callState.set(callSid, { ...currentState, menuOption: dtmfDigits });
        }

        if (["1", "2", "3", "4"].includes(dtmfDigits)) {
            // For valid menu selections, directly guide caller and start listening.
            const gather = twiml.gather({
                input: "speech dtmf",
                action: absoluteUrl("/voice/respond"),
                method: "POST",
                speechTimeout: "auto",
                timeout: 6,
                actionOnEmptyResult: true
            });
            await gatherSay(
                gather,
                await getAgentLine({ stage: "followup", language: selectedLanguage, menuDigit: dtmfDigits }),
                selectedLanguage
            );
        } else {
            const reply = await getAgentLine({ stage: "service_reply", language: selectedLanguage, menuDigit: dtmfDigits });
            await sayText(twiml, reply, selectedLanguage);
            twiml.pause({ length: 1 });
            twiml.redirect(
                { method: "POST" },
                absoluteUrl("/voice/listen")
            );
        }

        res.type("text/xml");
        res.send(twiml.toString());
        return;
    }

    try {
        const selectedOption = callSid ? callState.get(callSid)?.menuOption : null;
        let aiPrompt;

        if (selectedOption === "2") {
            aiPrompt = `You are a phone support assistant handling damaged or missing item complaints. Caller said: "${userInput}". Reply in 1 to 2 short sentences. Ask one useful next question (order number, item name, or delivery date). Reply in ${getLanguageName(selectedLanguage)} language. ${getLanguageOutputRule(selectedLanguage)}`;
        } else if (selectedOption === "3") {
            aiPrompt = `You are a phone support assistant handling return/refund requests. Caller said: "${userInput}". Reply in 1 to 2 short sentences. Ask one useful next question (order number, reason for return, or product condition). Reply in ${getLanguageName(selectedLanguage)} language. ${getLanguageOutputRule(selectedLanguage)}`;
        } else if (selectedOption === "4") {
            aiPrompt = `You are a customer care assistant. Caller said: "${userInput}". Reply politely in 1 to 2 short sentences and ask one clear next question to continue support. Reply in ${getLanguageName(selectedLanguage)} language. ${getLanguageOutputRule(selectedLanguage)}`;
        } else {
            aiPrompt = `You are on a live phone call. Keep the response under 2 short sentences. Caller said: ${userInput}. Reply in ${getLanguageName(selectedLanguage)} language. ${getLanguageOutputRule(selectedLanguage)}`;
        }

        const aiReply =
            await generateResponse(
                aiPrompt
            );

        await sayText(
            twiml,
            aiReply || "Thanks for sharing.",
            selectedLanguage
        );

        twiml.pause({
            length: 1
        });

        twiml.redirect(
            { method: "POST" },
            absoluteUrl("/voice/listen")
        );
    } catch (error) {
        console.error(
            "Voice response error:",
            error.message
        );

        await sayText(
            twiml,
            "I am facing a technical issue right now. Please try again later. Goodbye.",
            "en"
        );

        twiml.hangup();
    }

    res.type("text/xml");
    res.send(twiml.toString());
});

app.post("/voice/status", (req, res) => {
    const callSid = (req.body.CallSid || "").trim();
    console.log(
        "Twilio status callback:",
        {
            callSid,
            callStatus: req.body.CallStatus,
            to: req.body.To,
            from: req.body.From
        }
    );

    if (callSid && req.body.CallStatus === "completed") {
        callState.delete(callSid);
    }

    res.sendStatus(204);
});

app.use((error, req, res, next) => {
    console.error(
        "Unhandled server error:",
        error
    );

    res.status(500).json({
        error: "Internal server error"
    });
});

const server = app.listen(
    port,
    () => {
        console.log(
            `Server running on port ${port}`
        );
    }
);

process.stdin.resume();

process.on("SIGINT", () => {
    console.log(
        "Received SIGINT, shutting down server..."
    );

    server.close(() =>
        process.exit(0)
    );
});

process.on("SIGTERM", () => {
    console.log(
        "Received SIGTERM, shutting down server..."
    );

    server.close(() =>
        process.exit(0)
    );
});

process.on(
    "uncaughtException",
    error => {
        console.error(
            "Uncaught exception:",
            error
        );
    }
);

process.on(
    "unhandledRejection",
    reason => {
        console.error(
            "Unhandled rejection:",
            reason
        );
    }
);