const core = require('@actions/core');
const github = require('@actions/github');
const axios = require('axios');

try {
    // `id` input defined in action metadata file
    const host = encodeURIComponent(core.getInput('host'));
    const id = encodeURIComponent(core.getInput('id'));
    const token = core.getInput('token');
    const ref = core.getInput('ref');
    const variables = JSON.parse(core.getInput('variables'));

    // TODO: Get all variables in one string?
    // https://docs.gitlab.com/ee/api/pipeline_triggers.html#trigger-a-pipeline-with-a-token
    console.log(`Triggering pipeline ${id} with ref ${ref} on ${host}!`);

    axios.post(`https://${host}/api/v4/projects/${id}/trigger/pipeline`, {
        token: token,
        ref: ref,
        variables: variables,
    })
        .then(function (response) {
            // handle success
            console.log(response);

            const time = (new Date()).toTimeString();
            core.setOutput("status", time);
        })
        .catch(function (error) {
            // handle error
            // console.log(error);
            core.setFailed(error);
        })
        .finally(function () {
            // always executed
        });
} catch (error) {
    core.setFailed(error.message);
}
