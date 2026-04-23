let message =
    "Hello, this is a demo call from my AI voice agent.";

function getMessage() {
    return message;
}

function setMessage(newMessage) {
    if (typeof newMessage !== "string" || !newMessage.trim()) {
        throw new Error("Message must be a non-empty string");
    }
    message = newMessage.trim();
}

module.exports = {
    getMessage,
    setMessage
};
 