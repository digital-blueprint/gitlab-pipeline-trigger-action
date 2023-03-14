const core = require('@actions/core');
const github = require('@actions/github');
const axios = require('axios');

try {
    // `id` input defined in action metadata file
    const host = encodeURIComponent(core.getInput('host'));
    const id = encodeURIComponent(core.getInput('id'));
    const token = core.getInput('token');
    const ref = core.getInput('ref');
    const variables = core.getInput('variables');
    console.log(`Hello ${id}!`);

    axios.post(`https://${host}/api/v4/projects/${id}/trigger/pipeline`, {
        token: token,
        ref: ref,
        variables: variables,
    })
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
