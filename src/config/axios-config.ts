import axios from "axios";

const fiftyMBsInBytes = 50 * 1024 * 1024;
const fourMinutesInMilliseconds = 4 * 60 * 1000;

/**
 * The single bound on any one API request, shared by the instance below and by services that
 * build their own. A generation budget is only read between polls, so without this a request
 * that connects and never answers would outlive it and hang the CLI.
 */
export const REQUEST_TIMEOUT_MS = fourMinutesInMilliseconds;

const axiosInstance = axios.create({
  maxContentLength: fiftyMBsInBytes,
  maxBodyLength: fiftyMBsInBytes,
  timeout: REQUEST_TIMEOUT_MS
});

export default axiosInstance;
