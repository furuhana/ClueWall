import React, { useState } from 'react';
import { supabase } from '../../supabaseClient';
import './Login.css';

const Login: React.FC = () => {
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
                alert("Login Successful! Welcome, Detective.");
                // Redirect logic would go here, or global state update
            }
        } catch (error: any) {
            console.error("Login failed:", error);
            setErrorMsg(error.message || "Authentication failed");
        } finally {
            setLoading(false);
        }
    };



    return (
        <div className="login-container">
            <div className="login-card">
                <h2 className="login-title">ClueWall Access</h2>

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

                    {errorMsg && <div className="error-message">{errorMsg}</div>}

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
