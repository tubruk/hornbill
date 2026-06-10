import React, { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { Button } from "../components/Button";
import { Input } from "../components/Input";
import logo from "../assets/logo.png";

export function AuthView() {
  const { login, register, error, clearError } = useAuth();
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordRepeat, setPasswordRepeat] = useState("");
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [registrationEnabled, setRegistrationEnabled] = useState(true);

  useEffect(() => {
    document.title = isRegister ? "Register | Hornbill" : "Login | Hornbill";
  }, [isRegister]);

  useEffect(() => {
    fetch("/api/v1/status")
      .then((res) => {
        if (!res.ok) throw new Error();
        return res.json();
      })
      .then((data) => {
        if (data && typeof data.registration_enabled === "boolean") {
          setRegistrationEnabled(data.registration_enabled);
        }
      })
      .catch(() => {
        // Fallback to true if API is offline or using mock mode
        setRegistrationEnabled(true);
      });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    setFormError(null);

    if (!email || !password) {
      setFormError("Please fill out all required fields.");
      return;
    }

    if (isRegister && password !== passwordRepeat) {
      setFormError("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      if (isRegister) {
        await register(email, password, passwordRepeat);
      } else {
        await login(email, password);
      }
    } catch {
      // Error is stored in AuthContext but we catch to stop loading spinner
    } finally {
      setLoading(false);
    }
  };

  const toggleMode = () => {
    setIsRegister(!isRegister);
    setEmail("");
    setPassword("");
    setPasswordRepeat("");
    setFormError(null);
    clearError();
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background-warm px-4 py-12">
      <div className="w-full max-w-md bg-surface-warm border border-border-warm rounded-md p-8 shadow-md animate-scaleIn">
        {/* Logo and Brand */}
        <div className="flex flex-col items-center mb-8">
          <img src={logo} alt="Hornbill Logo" className="w-12 h-12 mb-3 object-contain" />
          <h2 className="font-display text-[28px] font-bold text-text-primary text-center">
            Hornbill
          </h2>
          <p className="font-body text-[14px] text-text-secondary mt-1 text-center">
            Recurring bill tracker
          </p>
        </div>

        {/* Auth Mode Tabs */}
        {registrationEnabled ? (
          <div className="flex border-b border-border-warm mb-6">
            <button
              onClick={() => isRegister && toggleMode()}
              className={`flex-1 pb-3 text-[16px] font-body font-semibold text-center border-b-2 transition-all duration-150 ${
                !isRegister
                  ? "border-primary text-primary"
                  : "border-transparent text-text-secondary hover:text-text-primary"
              }`}
            >
              Log In
            </button>
            <button
              onClick={() => !isRegister && toggleMode()}
              className={`flex-1 pb-3 text-[16px] font-body font-semibold text-center border-b-2 transition-all duration-150 ${
                isRegister
                  ? "border-primary text-primary"
                  : "border-transparent text-text-secondary hover:text-text-primary"
              }`}
            >
              Register
            </button>
          </div>
        ) : (
          <div className="border-b border-border-warm mb-6 pb-3">
            <h3 className="text-[18px] font-display font-semibold text-center text-text-primary">
              Log In
            </h3>
          </div>
        )}

        {/* Error Banners */}
        {(formError || error) && (
          <div className="mb-6 p-4 bg-error/10 border border-error/20 rounded-sm text-[14px] font-body text-error font-medium animate-fadeIn">
            {formError || error}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-5">
          <Input
            label="Email Address"
            type="email"
            id="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            disabled={loading}
          />
          <Input
            label="Password"
            type="password"
            id="password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            disabled={loading}
          />
          {isRegister && (
            <Input
              label="Confirm Password"
              type="password"
              id="confirm-password"
              placeholder="••••••••"
              value={passwordRepeat}
              onChange={(e) => setPasswordRepeat(e.target.value)}
              required
              disabled={loading}
            />
          )}

          <div className="pt-2">
            <Button
              type="submit"
              className="w-full h-11"
              disabled={loading}
            >
              {loading ? (
                <div className="flex items-center justify-center space-x-2">
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Please wait...</span>
                </div>
              ) : isRegister ? (
                "Create Account"
              ) : (
                "Sign In"
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
