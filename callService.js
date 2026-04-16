async function makeCalls() {

    console.log("TEST: makeCalls is running");

    for (let i = 1; i <= 2; i++) {

        console.log("Calling number", i);

        await new Promise(resolve =>
            setTimeout(resolve, 1000)
        );

    }

    console.log("TEST: finished");

}

module.exports = makeCalls;
