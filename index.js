const core = require('@actions/core');
const io = require('@actions/io');
const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');

// Helper functions for logging
const verboseLog = (message) => {
    if (core.getInput('verbose') === 'true') {
        console.log(message);
    }
};

const genericLog = (message) => {
    console.log(message);
};

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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
const pollPipeline = async (host, projectId, token, pipelineId, webUrl) => {
    genericLog('Polling pipeline status...');
    verboseLog(`Pipeline ${pipelineId} (${webUrl}) on ${host}`);

    const url = `${host}/api/v4/projects/${projectId}/pipelines/${pipelineId}`;
    let status = 'pending';
    const breakStatusList = ['failed', 'success', 'canceled', 'skipped'];

    while (true) {
        // wait 15 seconds
        await wait(15000);

        try {
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'PRIVATE-TOKEN': token,
                    Accept: 'application/json',
                },
            });

            if (!response.ok) {
                let errorMessage = `GitLab API returned status code ${response.status}.`;
                if (response.status === 401) {
                    errorMessage = 'Unauthorized: invalid/expired access token was used.';
                }
                if (core.getInput('verbose') === 'true') {
                    core.setFailed(errorMessage);
                } else {
                    core.setFailed('GitLab API request failed');
                }
                break;
            }

            const data = await response.json();

            status = data.status;
            core.setOutput('status', status);
            genericLog(`Pipeline status: ${status}`);

            if (status === 'failed') {
                if (core.getInput('verbose') === 'true') {
                    core.setFailed(`Pipeline failed!`);
                } else {
                    core.setFailed('Pipeline failed');
                }
            }

            if (breakStatusList.includes(status)) {
                genericLog(`Status "${status}" detected, breaking loop!`);
                break;
            }
        } catch (error) {
            if (core.getInput('verbose') === 'true') {
                core.setFailed(error.message);
            } else {
                core.setFailed('Error occurred while polling pipeline');
            }
            break;
        }
    }

    return status;
};

/**
 * Downloads job logs from a GitLab pipeline job
 * @param {string} host - GitLab host
 * @param {string} projectId - Project ID
 * @param {string} token - Access token
 * @param {string} jobId - Job ID
 * @param {string} jobName - Job name
 * @param {string} jobLogsPath - Path to save job logs
 * @returns {Promise<boolean>} - Whether job logs were downloaded successfully
 */
const downloadJobLogs = async (host, projectId, token, jobId, jobName, jobLogsPath) => {
    try {
        genericLog('Downloading job logs...');
        verboseLog(`Job: ${jobName} (${jobId})`);

        const logUrl = `${host}/api/v4/projects/${projectId}/jobs/${jobId}/trace`;
        const logResponse = await fetch(logUrl, {
            method: 'GET',
            headers: {
                'PRIVATE-TOKEN': token,
                Accept: 'text/plain',
            },
        });

        if (!logResponse.ok) {
            genericLog('Failed to download job logs');
            verboseLog(`Job ${jobName} (${jobId}): Response code ${logResponse.status}`);
            return false;
        }

        const logContent = await logResponse.text();
        const logFilePath = path.join(jobLogsPath, 'job.log');

        fs.writeFileSync(logFilePath, logContent);
        genericLog('Job logs downloaded successfully');
        verboseLog(`Job ${jobName} (${jobId})`);
        return true;
    } catch (error) {
        genericLog('Error downloading job logs');
        verboseLog(`Job ${jobName} (${jobId}): Error ${error.message}`);
        return false;
    }
};

/**
 * Downloads job logs from all jobs in a pipeline
 * @param {string} host - GitLab host
 * @param {string} projectId - Project ID
 * @param {string} token - Access token
 * @param {string} pipelineId - Pipeline ID
 * @param {string} downloadPath - Path to save job logs
 * @param {Array} jobs - Array of pipeline jobs (pre-fetched)
 * @returns {Promise<boolean>} - Whether job logs were downloaded successfully
 */
const downloadAllJobLogs = async (host, projectId, token, pipelineId, downloadPath, jobs) => {
    try {
        genericLog('Downloading job logs for pipeline...');
        verboseLog(`Pipeline ${pipelineId}`);

        // Create download directory
        await io.mkdirP(downloadPath);

        let logsDownloadedCount = 0;

        // Download logs from all jobs
        for (const job of jobs) {
            try {
                const jobLogsPath = path.join(
                    downloadPath,
                    `job_${job.id}_${job.name.replace(/[^a-zA-Z0-9]/g, '_')}`,
                );

                // Create job-specific directory
                await io.mkdirP(jobLogsPath);

                const logDownloaded = await downloadJobLogs(
                    host,
                    projectId,
                    token,
                    job.id,
                    job.name,
                    jobLogsPath,
                );
                if (logDownloaded) {
                    logsDownloadedCount++;
                }
            } catch (error) {
                genericLog('Error processing job logs');
                verboseLog(`Job ${job.name} (${job.id}): Error ${error.message}`);
            }
        }

        if (logsDownloadedCount > 0) {
            genericLog(`Successfully downloaded logs from ${logsDownloadedCount} jobs`);
            return true;
        } else {
            genericLog('No job logs were successfully downloaded');
            return false;
        }
    } catch (error) {
        genericLog('Error downloading job logs');
        verboseLog(`Pipeline ${pipelineId}: Error ${error.message}`);
        return false;
    }
};

/**
 * Downloads artifacts from a GitLab pipeline job
 * @param {string} host - GitLab host
 * @param {string} projectId - Project ID
 * @param {string} token - Access token
 * @param {string} pipelineId - Pipeline ID
 * @param {string} downloadPath - Path to save artifacts and logs
 * @param {boolean} downloadJobLogsFlag - Whether to download job logs
 * @param {Array} jobs - Array of pipeline jobs (pre-fetched)
 * @returns {Promise<boolean>} - Whether artifacts were downloaded successfully
 */
const downloadArtifacts = async (
    host,
    projectId,
    token,
    pipelineId,
    downloadPath,
    downloadJobLogsFlag,
    jobs,
) => {
    try {
        genericLog('Downloading artifacts for pipeline...');
        verboseLog(`Pipeline ${pipelineId}`);

        const jobsWithArtifacts = jobs.filter(
            (job) => job.artifacts_file && job.artifacts_file.filename,
        );

        if (jobsWithArtifacts.length === 0 && !downloadJobLogsFlag) {
            genericLog('No jobs with artifacts found and job logs not requested');
            return false;
        }

        // Create download directory
        await io.mkdirP(downloadPath);

        let downloadedCount = 0;
        let logsDownloadedCount = 0;

        // Download artifacts from jobs that have them
        for (const job of jobsWithArtifacts) {
            try {
                genericLog('Downloading artifacts from job...');
                verboseLog(`Job ${job.name} (${job.id})`);

                const artifactUrl = `${host}/api/v4/projects/${projectId}/jobs/${job.id}/artifacts`;
                const artifactResponse = await fetch(artifactUrl, {
                    method: 'GET',
                    headers: {
                        'PRIVATE-TOKEN': token,
                        Accept: 'application/octet-stream',
                    },
                });

                if (!artifactResponse.ok) {
                    genericLog('Failed to download artifacts for job');
                    verboseLog(
                        `Job ${job.name} (${job.id}): Response code ${artifactResponse.status}`,
                    );
                    continue;
                }

                const artifactBuffer = await artifactResponse.arrayBuffer();
                const jobArtifactsPath = path.join(
                    downloadPath,
                    `job_${job.id}_${job.name.replace(/[^a-zA-Z0-9]/g, '_')}`,
                );

                // Create job-specific directory
                await io.mkdirP(jobArtifactsPath);

                // Save the zip file
                const zipPath = path.join(jobArtifactsPath, 'artifacts.zip');
                fs.writeFileSync(zipPath, Buffer.from(artifactBuffer));

                // Extract the zip file
                const zip = new AdmZip(zipPath);
                zip.extractAllTo(jobArtifactsPath, true);

                // Remove the zip file after extraction
                fs.unlinkSync(zipPath);

                genericLog('Successfully downloaded artifacts for job');
                verboseLog(`Job ${job.name} (${job.id})`);
                downloadedCount++;
            } catch (error) {
                genericLog('Error downloading artifacts for job');
                verboseLog(`Job ${job.name} (${job.id}): Error ${error.message}`);
            }
        }

        // Download job logs if requested
        if (downloadJobLogsFlag) {
            genericLog('Downloading job logs...');
            for (const job of jobs) {
                try {
                    const jobLogsPath = path.join(
                        downloadPath,
                        `job_${job.id}_${job.name.replace(/[^a-zA-Z0-9]/g, '_')}`,
                    );

                    // Create job directory if it doesn't exist (for jobs without artifacts)
                    if (!jobsWithArtifacts.find((j) => j.id === job.id)) {
                        await io.mkdirP(jobLogsPath);
                    }

                    const logDownloaded = await downloadJobLogs(
                        host,
                        projectId,
                        token,
                        job.id,
                        job.name,
                        jobLogsPath,
                    );
                    if (logDownloaded) {
                        logsDownloadedCount++;
                    }
                } catch (error) {
                    genericLog('Error processing job logs');
                    verboseLog(`Job ${job.name} (${job.id}): Error ${error.message}`);
                }
            }
        }

        if (downloadedCount > 0 || logsDownloadedCount > 0) {
            const summary = [];
            if (downloadedCount > 0) {
                summary.push(`artifacts from ${downloadedCount} jobs`);
            }
            if (logsDownloadedCount > 0) {
                summary.push(`logs from ${logsDownloadedCount} jobs`);
            }
            genericLog(`Successfully downloaded ${summary.join(' and ')}`);
            return true;
        } else {
            genericLog('No artifacts or logs were successfully downloaded');
            return false;
        }
    } catch (error) {
        genericLog('Error downloading artifacts');
        verboseLog(`Pipeline ${pipelineId}: Error ${error.message}`);
        return false;
    }
};

async function run() {
    let host = core.getInput('host');
    const projectId = encodeURIComponent(core.getInput('id'));
    const triggerToken = core.getInput('trigger_token');
    const accessToken = core.getInput('access_token');
    const ref = core.getInput('ref');
    const variables = JSON.parse(core.getInput('variables'));
    const downloadArtifactsFlag = core.getInput('download_artifacts') === 'true';
    const downloadArtifactsOnFailure = core.getInput('download_artifacts_on_failure') === 'true';
    const downloadJobLogsFlag = core.getInput('download_job_logs') === 'true';
    const failIfNoArtifacts = core.getInput('fail_if_no_artifacts') === 'true';
    const downloadPath = core.getInput('download_path');
    const verbose = core.getInput('verbose') === 'true';

    verboseLog(`Verbose logging is ${verbose ? 'enabled' : 'disabled'}`);

    // Ensure host has proper protocol
    if (!host.startsWith('http://') && !host.startsWith('https://')) {
        host = `https://${host}`;
    }

    genericLog('Triggering GitLab pipeline...');
    verboseLog(`Pipeline for ${projectId} (${ref}) on ${host}`);

    if (downloadArtifactsFlag && !accessToken) {
        if (core.getInput('verbose') === 'true') {
            core.setFailed(
                'download_artifacts is enabled but access_token is not provided. Access token is required to download artifacts.',
            );
        } else {
            core.setFailed('Access token is required to download artifacts');
        }
        return;
    }

    if (downloadJobLogsFlag && !accessToken) {
        if (core.getInput('verbose') === 'true') {
            core.setFailed(
                'download_job_logs is enabled but access_token is not provided. Access token is required to download job logs.',
            );
        } else {
            core.setFailed('Access token is required to download job logs');
        }
        return;
    }

    try {
        const url = `${host}/api/v4/projects/${projectId}/trigger/pipeline`;

        // https://docs.gitlab.com/ee/api/pipeline_triggers.html#trigger-a-pipeline-with-a-token
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                token: triggerToken,
                ref: ref,
                variables: variables,
            }),
        });

        if (!response.ok) {
            let errorMessage = `GitLab API returned status code ${response.status}.`;
            if (response.status === 404) {
                errorMessage =
                    'The specified resource does not exist, or an invalid/expired trigger token was used.';
            }
            if (core.getInput('verbose') === 'true') {
                return core.setFailed(errorMessage);
            } else {
                return core.setFailed('Failed to trigger pipeline');
            }
        }

        const data = await response.json();

        core.setOutput('id', data.id);
        core.setOutput('status', data.status);
        core.setOutput('web_url', data.web_url);
        genericLog('Pipeline triggered successfully');
        verboseLog(`Pipeline id ${data.id}. See ${data.web_url} for details.`);

        // poll pipeline status
        const finalStatus = await pollPipeline(host, projectId, accessToken, data.id, data.web_url);

        // Fetch jobs once if either artifacts or logs need to be downloaded
        let jobs = null;
        if (downloadArtifactsFlag || downloadJobLogsFlag) {
            genericLog('Fetching pipeline jobs...');
            const jobsUrl = `${host}/api/v4/projects/${projectId}/pipelines/${data.id}/jobs`;
            const jobsResponse = await fetch(jobsUrl, {
                method: 'GET',
                headers: {
                    'PRIVATE-TOKEN': accessToken,
                    Accept: 'application/json',
                },
            });

            if (!jobsResponse.ok) {
                genericLog('Failed to fetch pipeline jobs');
                verboseLog(`Pipeline ${data.id}: Response code ${jobsResponse.status}`);
                jobs = [];
            } else {
                jobs = await jobsResponse.json();
                genericLog(`Found ${jobs.length} jobs in pipeline`);
            }
        }

        // Download artifacts if enabled
        if (downloadArtifactsFlag && jobs) {
            let shouldDownload = false;
            let downloadReason = '';

            if (finalStatus === 'success') {
                shouldDownload = true;
                downloadReason = 'Pipeline succeeded';
            } else if (downloadArtifactsOnFailure && finalStatus === 'failed') {
                shouldDownload = true;
                downloadReason = 'Pipeline failed but artifacts download on failure is enabled';
            }

            if (shouldDownload) {
                genericLog(`${downloadReason}, downloading artifacts...`);
                const artifactsDownloaded = await downloadArtifacts(
                    host,
                    projectId,
                    accessToken,
                    data.id,
                    downloadPath,
                    downloadJobLogsFlag,
                    jobs,
                );
                core.setOutput('artifacts_downloaded', artifactsDownloaded.toString());

                if (artifactsDownloaded) {
                    genericLog('Artifacts and logs downloaded successfully');
                } else {
                    genericLog('No artifacts or logs were downloaded');

                    // Fail the action if no artifacts found and fail_if_no_artifacts is enabled
                    if (failIfNoArtifacts) {
                        if (core.getInput('verbose') === 'true') {
                            core.setFailed(
                                'No artifacts were found and fail_if_no_artifacts is enabled. This may indicate a configuration issue or that the pipeline did not generate expected artifacts.',
                            );
                        } else {
                            core.setFailed(
                                'No artifacts were found and fail_if_no_artifacts is enabled',
                            );
                        }
                        return;
                    }
                }
            } else {
                genericLog(`Pipeline status is ${finalStatus}, skipping artifact download`);
                core.setOutput('artifacts_downloaded', 'false');
            }
        }

        // Download job logs independently if enabled
        if (downloadJobLogsFlag && jobs) {
            genericLog('Downloading job logs...');
            const logsDownloaded = await downloadAllJobLogs(
                host,
                projectId,
                accessToken,
                data.id,
                downloadPath,
                jobs,
            );

            if (logsDownloaded) {
                genericLog('Job logs downloaded successfully');
            } else {
                genericLog('No job logs were downloaded');
            }
        }
    } catch (error) {
        if (core.getInput('verbose') === 'true') {
            core.setFailed(error.message);
        } else {
            core.setFailed('An error occurred while running the action');
        }
    }
}

run();
