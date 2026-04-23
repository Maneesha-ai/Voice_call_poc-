require("dotenv").config();

const express = require("express");
const twilio = require("twilio");
const makeCalls = require("./callService");
const generateResponse = require("./aiService");
const { getMessage, setMessage } = require("./message");

const app = express();
const port = Number(process.env.PORT) || 3000;
const publicBaseUrl = (process.env.PUBLIC_BASE_URL || "").replace(/\/+$/, "");

function absoluteUrl(pathname) {
    if (!publicBaseUrl) {
        return pathname;
    }
    return `${publicBaseUrl}${pathname}`;
}

app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
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
        res.status(500).json({ error: error.message });
    }
});

app.post("/voice/intro", (req, res) => {
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

    gather.say({ voice: "alice" }, introMessage);
    gather.say(
        { voice: "alice" },
        "Please tell me how I can help you after the beep."
    );

    twiml.say(
        { voice: "alice" },
        "I did not hear anything. Please call again when you are ready. Goodbye."
    );
    twiml.hangup();

    res.type("text/xml");
    res.send(twiml.toString());
});

app.post("/voice/respond", async (req, res) => {
    const twiml = new twilio.twiml.VoiceResponse();
    const speechResult = (req.body.SpeechResult || "").trim();
    const dtmfDigits = (req.body.Digits || "").trim();
    const userInput = speechResult || dtmfDigits;

    if (!userInput) {
        twiml.say({ voice: "alice" }, "Sorry, I did not catch that.");
        twiml.redirect({ method: "POST" }, absoluteUrl("/voice/intro"));
        res.type("text/xml");
        res.send(twiml.toString());
        return;
    }

    try {
        const aiReply = await generateResponse(
            `You are on a live phone call. Keep the response under 2 short sentences. Caller said: ${userInput}`
        );

        twiml.say({ voice: "alice" }, aiReply || "Thanks for sharing.");
        twiml.pause({ length: 1 });
        twiml.redirect({ method: "POST" }, absoluteUrl("/voice/intro"));
    } catch (error) {
        console.error("Voice response error:", error.message);
        twiml.say(
            { voice: "alice" },
            "I am facing a technical issue right now. Please try again later. Goodbye."
        );
        twiml.hangup();
    }

    res.type("text/xml");
    res.send(twiml.toString());
});

app.post("/voice/status", (req, res) => {
    console.log("Twilio status callback:", {
        callSid: req.body.CallSid,
        callStatus: req.body.CallStatus,
        to: req.body.To,
        from: req.body.From
    });
    res.sendStatus(204);
});

app.use((error, req, res, next) => {
    console.error("Unhandled server error:", error);
    res.status(500).json({ error: "Internal server error" });
});


const server = app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});

// Keep the process attached in environments that detach quickly after startup.
process.stdin.resume();

process.on("SIGINT", () => {
    console.log("Received SIGINT, shutting down server...");
    server.close(() => process.exit(0));
});

process.on("SIGTERM", () => {
    console.log("Received SIGTERM, shutting down server...");
    server.close(() => process.exit(0));
});

process.on("uncaughtException", (error) => {
    console.error("Uncaught exception:", error);
});

process.on("unhandledRejection", (reason) => {
    console.error("Unhandled rejection:", reason);
});