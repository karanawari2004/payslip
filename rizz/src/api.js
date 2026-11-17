import axios from "axios";

const api = axios.create({
  baseURL: "https://payslip-1-livf.onrender.com/api",
  withCredentials: true,
});

export default api;
