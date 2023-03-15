const core = require('@actions/core');
const github = require('@actions/github');
const axios = require('axios');

const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const pollPipeline = async (host, id, token, pipelineId) => {
    const url = `https://${host}/api/v4/projects/${id}/pipelines/${pipelineId}`;
    console.log(`Polling pipeline ${pipelineId} on ${host}!`);

    let status = 'pending';
    while (status === 'pending') {
        await wait(5000);
        const response = await axios.get(url, {
            headers: {
                'PRIVATE-TOKEN': token,
            },
        });
        status = response.data.status;
        console.log(`Pipeline status: ${status}`);
    }

    return status;
}

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
    console.log("variables", variables);

    axios.post(`https://${host}/api/v4/projects/${id}/trigger/pipeline`, {
        token: token,
        ref: ref,
        variables: variables,
    })
        .then(function (response) {
            // handle success
            console.log(response);
            const data = response.data;

            core.setOutput("id", data.id);
            core.setOutput("status", data.status);

            pollPipeline(host, id, token, data.id);
        })
        .catch(function (error) {
            // handle error
            console.log(error);
            core.setFailed(error);
        })
        .finally(function () {
            // always executed
        });
} catch (error) {
    core.setFailed(error.message);
}
