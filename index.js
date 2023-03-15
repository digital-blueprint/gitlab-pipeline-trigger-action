const core = require('@actions/core');
const github = require('@actions/github');
const axios = require('axios');

const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * GitLab pipeline status values:
 * - created: The pipeline has been created but has not yet been processed.
 * - pending: The pipeline is queued and waiting for available resources to start running.
 * - running: The pipeline is currently running.
 * - failed: The pipeline has completed running, but one or more jobs have failed.
 * - success: The pipeline has completed running, and all jobs have succeeded.
 * - canceled: The pipeline has been canceled by a user or system.
 * - skipped: The pipeline was skipped due to a configuration option or a pipeline rule.
 * - manual: The pipeline is waiting for a user to trigger it manually.
 */
const pollPipeline = async (host, id, token, pipelineId) => {
    const url = `https://${host}/api/v4/projects/${id}/pipelines/${pipelineId}`;
    console.log(`Polling pipeline ${pipelineId} on ${host}!`);
    // console.log("url", url);
    let status = 'pending';
    const breakStatusList = ['failed', 'success', 'canceled', 'skipped'];

    while (true) {
        await wait(5000);
        const response = await axios.get(url, {
            headers: {
                'PRIVATE-TOKEN': token,
            },
        });

        status = response.data.status;
        core.setOutput("status", status);
        console.log(`Pipeline status: ${status}`);

        if (status === 'failed') {
            core.setFailed(`Pipeline failed!`);
        }

        if (breakStatusList.includes('success')) {
            console.log(`Status "${status}" detected, breaking loop!`);
            break;
        }
    }

    return status;
}

try {
    const host = encodeURIComponent(core.getInput('host'));
    const projectId = encodeURIComponent(core.getInput('id'));
    const triggerToken = core.getInput('trigger_token');
    const accessToken = core.getInput('access_token');
    const ref = core.getInput('ref');
    const variables = JSON.parse(core.getInput('variables'));

    console.log(`Triggering pipeline ${projectId} with ref ${ref} on ${host}!`);
    // console.log("variables", variables);

    const url = `https://${host}/api/v4/projects/${projectId}/trigger/pipeline`;
    // console.log("url", url);

    // https://docs.gitlab.com/ee/api/pipeline_triggers.html#trigger-a-pipeline-with-a-token
    axios.post(url, {
        token: triggerToken,
        ref: ref,
        variables: variables,
    })
        .then(function (response) {
            // handle success
            // console.log(response);
            const data = response.data;

            core.setOutput("id", data.id);
            core.setOutput("status", data.status);

            pollPipeline(host, projectId, accessToken, data.id);
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
