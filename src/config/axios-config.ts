import axios from "axios";

const fiftyMBsInBytes = 50 * 1024 * 1024;
const fiveMinutesInMilliseconds = 5 * 60 * 1000;

const axiosInstance = axios.create({
  maxContentLength: fiftyMBsInBytes,
  maxBodyLength: fiftyMBsInBytes,
  timeout: fiveMinutesInMilliseconds
});

export default axiosInstance;
