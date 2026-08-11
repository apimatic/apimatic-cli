import axios from "axios";

const fiftyMBsInBytes = 50 * 1024 * 1024;
const fiveMinutesInMilliseconds = 5 * 60 * 1000;

/** For services that build their own instance and so cannot use the one below. */
export const REQUEST_TIMEOUT_MS = fiveMinutesInMilliseconds;

const axiosInstance = axios.create({
  maxContentLength: fiftyMBsInBytes,
  maxBodyLength: fiftyMBsInBytes,
  timeout: fiveMinutesInMilliseconds
});

export default axiosInstance;
