import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useCallback, useEffect, useRef, useState } from "react";

import AddClub from "./pages/AddClub";
import Login from "./pages/Login";
import  Admin from "./pages/Admin";
import Report from "./pages/Report";
import api from "./api";

function AppRoutes() {
  const [user, setUser] = useState(null);
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [authError, setAuthError] = useState("");
  const authRevision = useRef(0);
  const [sessionCheckError, setSessionCheckError] = useState("");
  const [sessionAttempt, setSessionAttempt] = useState(0);

  useEffect(() => {
    let isActive = true;
    const requestRevision = authRevision.current;
    setIsCheckingSession(true);
    setSessionCheckError("");

    api
      .get("/session")
      .then(({ data }) => {
        if (isActive && requestRevision === authRevision.current) {
          setUser(data.user);
        }
      })
      .catch((error) => {
        if (isActive && requestRevision === authRevision.current) {
          if (error.response?.status === 401) {
            setUser(null);
          } else {
            setSessionCheckError(
              "Unable to verify your session. Check your connection and try again."
            );
          }
        }
      })
      .finally(() => {
        if (isActive && requestRevision === authRevision.current) {
          setIsCheckingSession(false);
        }
      });

    return () => {
      isActive = false;
    };
  }, [sessionAttempt]);

  const handleLogin = useCallback((authenticatedUser) => {
    authRevision.current += 1;
    setUser(authenticatedUser);
    setAuthError("");
  }, []);

  const handleLogout = useCallback(async () => {
    authRevision.current += 1;

    try {
      await api.post("/logout");

      setUser(null);
      setAuthError("");
    } catch (error) {
      console.error("Logout error:", error);

      setAuthError("Unable to sign out. Please try again.");
    }
  }, []);

  const handleSessionExpired = useCallback(() => {
    authRevision.current += 1;
    setUser(null);
    setAuthError("");
  }, []);

  if (isCheckingSession) {
    return (



<div
  role="status"
  style={{
    minHeight: "100vh",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: "16px",
    background: "#0b1120",
    color: "#f4eee5",
  }}
>
  <div
    style={{
      width: "40px",
      height: "40px",
      border: "3px solid rgba(201,169,110,0.2)",
      borderTop: "3px solid #c9a96e",
      borderRadius: "50%",
      animation: "rizztixxSpin 0.8s linear infinite",
    }}
  />

  <h2
    style={{
      margin: 0,
      fontSize: "24px",
      fontWeight: "600",
      letterSpacing: "2px",
    }}
  >
      Please Wait...
  </h2>

  <p style={{ margin: 0, color: "#c9a96e", fontSize: "14px" }}>
  
  </p>

  <style>
    {`
      @keyframes rizztixxSpin {
        to { transform: rotate(360deg); }
      }
    `}
  </style>
</div>




    );
  }

  if (sessionCheckError) {
    return (
      <div
        role="alert"
        style={{
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "16px",
          background: "#0b1120",
          color: "#f4eee5",
          textAlign: "center",
          padding: "24px",
        }}
      >
        <p>{sessionCheckError}</p>
        <button type="button" onClick={() => setSessionAttempt((attempt) => attempt + 1)}>
          Retry
        </button>
      </div>
    );
  }

  return (
    <>
      {authError && (
        <div className="auth-error" role="alert">
          {authError}
        </div>
      )}

      <Routes>
    
        <Route
          path="/"
          element={
            user ? (
              <Navigate to="/admin" replace />
            ) : (
              <Login onLogin={handleLogin} />
            )
          }
        />

      
        <Route
          path="/admin"
          element={
            user ? (
              <Admin
                user={user}
                onLogout={handleLogout}
                onUserUpdate={setUser}
                onSessionExpired={handleSessionExpired}
              />
            ) : (
              <Navigate to="/" replace />
            )
          }
        />

  
        <Route
          path="/add-club"
          element={
            user ? (
              <AddClub />
            ) : (
              <Navigate to="/" replace />
            )
          }
        />

        
        <Route
          path="/report"
          element={
            user ? (
              <Report onLogout={handleLogout} />
            ) : (
              <Navigate to="/" replace />
            )
          }
        />

        
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}
