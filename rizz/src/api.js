import axios from "axios";

const api = axios.create({
  baseURL: "https://payslip-v47v.onrender.com/api",
  withCredentials: true,
});

export default api;
