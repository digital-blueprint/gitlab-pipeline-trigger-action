const core = require('@actions/core');
const github = require('@actions/github');
const axios = require('axios');

try {
    // `id` input defined in action metadata file
    const id = core.getInput('id');
    console.log(`Hello ${id}!`);

    axios.get('https://api.github.com/users/pbek')
        .then(function (response) {
            // handle success
            console.log(response);
        })
        .catch(function (error) {
            // handle error
            console.log(error);
        })
        .finally(function () {
            // always executed
        });

    const time = (new Date()).toTimeString();
    core.setOutput("status", time);
    // Get the JSON webhook payload for the event that triggered the workflow
    const payload = JSON.stringify(github.context.payload, undefined, 2)
    console.log(`The event payload: ${payload}`);
} catch (error) {
    core.setFailed(error.message);
}
