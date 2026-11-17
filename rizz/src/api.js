import axios from "axios";

const backendUrl = import.meta.env.VITE_BACKEND_URL;

if (!backendUrl) {
  throw new Error("VITE_BACKEND_URL must be configured for this environment");
}

const api = axios.create({
  baseURL: `${backendUrl.replace(/\/+$/, "")}/api`,
  withCredentials: true,
});

export default api;
