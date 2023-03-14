const core = require('@actions/core');
const github = require('@actions/github');

try {
    // `id` input defined in action metadata file
    const id = core.getInput('id');
    console.log(`Hello ${id}!`);
    const time = (new Date()).toTimeString();
    core.setOutput("status", time);
    // Get the JSON webhook payload for the event that triggered the workflow
    const payload = JSON.stringify(github.context.payload, undefined, 2)
    console.log(`The event payload: ${payload}`);
} catch (error) {
    core.setFailed(error.message);
}
