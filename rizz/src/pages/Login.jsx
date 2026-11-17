import { useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api";
import "./Login.css";

export default function Login({ onLogin }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const navigate = useNavigate();

  async function handleLogin(e) {
    e.preventDefault();

    if (loading) return;

    setError("");
    setLoading(true);

    try {
      // Step 1: Send login credentials
      await api.post(
        "/login",
        {
          username: username.trim(),
          password,
        },
        {
          withCredentials: true,
        }
      );

      // Step 2: Verify authenticated session
      const sessionResponse = await api.get("/session", {
        withCredentials: true,
      });

      // Step 3: Validate session response
      const user = sessionResponse.data?.user;

      if (!sessionResponse.data?.success || !user) {
        throw new Error("SESSION_VERIFICATION_FAILED");
      }

      // Step 4: Update application authentication state
      onLogin(user);

      // Step 5: Navigate to admin dashboard
      navigate("/admin", { replace: true });

    } catch (err) {
      console.error("Login error:", {
        status: err.response?.status,
        message: err.response?.data?.message || err.message,
      });

      if (
        err.message === "SESSION_VERIFICATION_FAILED" ||
        err.response?.config?.url === "/session"
      ) {
        setError(
          "Login succeeded, but your session could not be verified. Please log in again."
        );
      } else {
        setError(
          err.response?.data?.message ||
          "Unable to connect to the server. Please try again."
        );
      }

    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={handleLogin}>
        <h1>PayNthra</h1>

        <p>Sign in to continue</p>

        {error && <p className="login-error">{error}</p>}

        <label htmlFor="username">Username</label>

        <input
          id="username"
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="username"
          required
          disabled={loading}
        />

        <label htmlFor="password">Password</label>

        <input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          required
          disabled={loading}
        />

        <button type="submit" disabled={loading}>
          {loading ? "Logging in..." : "Login"}
        </button>
      </form>
    </div>
  );
}