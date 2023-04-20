const core = require('@actions/core');
const axios = require('axios');

const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * GitLab pipeline status values (see https://docs.gitlab.com/ee/api/pipelines.html#list-project-pipelines):
 * - created: The pipeline has been created but has not yet been processed.
 * - preparing: The pipeline is being prepared to run.
 * - pending: The pipeline is queued and waiting for available resources to start running.
 * - waiting_for_resource: The pipeline is queued, but there are not enough resources available to start running.
 * - running: The pipeline is currently running.
 * - scheduled: The pipeline is scheduled to run at a later time.
 * - failed: The pipeline has completed running, but one or more jobs have failed.
 * - success: The pipeline has completed running, and all jobs have succeeded.
 * - canceled: The pipeline has been canceled by a user or system.
 * - skipped: The pipeline was skipped due to a configuration option or a pipeline rule.
 * - manual: The pipeline is waiting for a user to trigger it manually.
 */
const pollPipeline = async (host, id, token, pipelineId) => {
    console.log(`Polling pipeline ${pipelineId} on ${host}!`);

    const url = `https://${host}/api/v4/projects/${id}/pipelines/${pipelineId}`;
    let status = 'pending';
    const breakStatusList = ['failed', 'success', 'canceled', 'skipped'];

    while (true) {
        // wait 15 seconds
        await wait(15000);

        try {
            const response = await axios.get(url, {
                headers: {
                    // Token can be empty for public projects
                    'PRIVATE-TOKEN': token,
                },
            });

            status = response.data.status;
            core.setOutput("status", status);
            console.log(`Pipeline status: ${status}`);

            if (status === 'failed') {
                core.setFailed(`Pipeline failed!`);
            }

            if (breakStatusList.includes(status)) {
                console.log(`Status "${status}" detected, breaking loop!`);
                break;
            }
        } catch (error) {
            core.setFailed(error.message);
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
    const url = `https://${host}/api/v4/projects/${projectId}/trigger/pipeline`;

    // https://docs.gitlab.com/ee/api/pipeline_triggers.html#trigger-a-pipeline-with-a-token
    axios.post(url, {
        token: triggerToken,
        ref: ref,
        variables: variables,
    })
        .then(function (response) {
            const data = response.data;

            core.setOutput("id", data.id);
            core.setOutput("status", data.status);
            console.log(`Pipeline id ${data.id} triggered! See ${data.web_url} for details.`);

            // poll pipeline status
            pollPipeline(host, projectId, accessToken, data.id);
        })
        .catch(function (error) {
            // handle error
            console.log(error);
            core.setFailed(error);
        });
} catch (error) {
    core.setFailed(error.message);
}
