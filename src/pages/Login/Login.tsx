import React, { useState } from 'react';
import { supabase } from '../../supabaseClient';
import './Login.css';

import { toast } from 'sonner';

interface LoginProps {
    loginMessage: string | null;
}

const Login: React.FC<LoginProps> = ({ loginMessage }) => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setErrorMsg(null);

        try {
            const { data, error } = await supabase.auth.signInWithPassword({
                email,
                password,
            });

            if (error) throw error;

            console.log("Login successful, session:", data.session);
            // Verify session is active
            if (data.session) {
                toast.success("Identity Verified. Access Granted.");
                // Redirect logic handled by App listener
            }
        } catch (error: any) {
            console.error("Login failed:", error);
            setErrorMsg(error.message || "Authentication failed");
            toast.error("Authentication Failed");
        } finally {
            setLoading(false);
        }
    };

    const hasError = errorMsg || loginMessage;

    return (
        <div className="login-container">
            <div className="login-card">
                <h2 className="login-title">ClueWall Access</h2>

                {hasError && (
                    <div className="w-full bg-red-900/50 border border-red-500/30 text-red-200 text-xs font-mono p-3 mb-4 rounded text-center tracking-wide animate-pulse">
                        {errorMsg || loginMessage}
                    </div>
                )}

                <form onSubmit={handleLogin}>
                    <div className="form-group">
                        <label className="form-label" htmlFor="email">Agent ID (Email)</label>
                        <input
                            id="email"
                            type="email"
                            className="form-input"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="agent@agency.com"
                            required
                        />
                    </div>

                    <div className="form-group">
                        <label className="form-label" htmlFor="password">Passcode</label>
                        <input
                            id="password"
                            type="password"
                            className="form-input"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="••••••••"
                            required
                        />
                    </div>

                    <button
                        type="submit"
                        className="auth-button btn-primary"
                        disabled={loading}
                    >
                        {loading ? 'Authenticating...' : 'Secure Login'}
                    </button>
                </form>
            </div>
        </div>
    );
};

export default Login;
