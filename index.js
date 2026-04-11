require("dotenv").config();

const express = require("express");
const makeCalls = require("./callService");
const { setMessage } = require("./message");

const app = express();
const port = Number(process.env.PORT) || 3000;

app.use(express.json());

function requireApiKey(req, res, next) {
    const key = process.env.API_KEY;
    if (!key) {
        return next();
    }
    const sent = req.headers["x-api-key"];
    if (sent !== key) {
        return res.status(401).json({ error: "Invalid or missing x-api-key header" });
    }
    next();
}

app.get("/", (req, res) => {
    res.send("Voice Agent Server Running");
});

app.post("/set-message", requireApiKey, (req, res) => {
    try {
        const { message } = req.body || {};
        setMessage(message);
        res.json({ ok: true, detail: "Message saved" });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

app.post("/start-calls", requireApiKey, async (req, res) => {
    try {
        const result = await makeCalls();
        if (!result.ok) {
            return res.status(400).json({ error: result.error });
        }
        res.json({
            ok: true,
            detail: "Calls completed (simulated)",
            count: result.count
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Call run failed" });
    }
});

app.listen(port, () => {
    if (process.env.API_KEY) {
        console.log("API_KEY is set; x-api-key header required for protected routes.");
    } else {
        console.warn("API_KEY not set; server is open (set API_KEY in production).");
    }
    console.log(`Server running on port ${port}`);
});
