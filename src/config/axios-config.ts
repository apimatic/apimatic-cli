import axios from "axios";

const fiftyMBsInBytes = 50 * 1024 * 1024;

const axiosInstance = axios.create({
  maxContentLength: fiftyMBsInBytes,
  maxBodyLength: fiftyMBsInBytes,
});

export default axiosInstance;
