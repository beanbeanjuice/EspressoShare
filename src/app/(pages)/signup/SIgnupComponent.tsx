'use client';

import { useState } from "react";
import { Box, Button, TextField, Typography } from "@mui/material";

interface SignUpProps {
    onSubmit?: (email: string, username: string, password: string) => void;
}

export default function SignUpComponent({ onSubmit }: SignUpProps) {
    const [email, setEmail] = useState("");
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [submitted, setSubmitted] = useState(false);

    const passwordsMatch = password === confirmPassword;
    const showMismatch = submitted && !passwordsMatch;

    const handleSubmit = (e: any) => {
        e.preventDefault();
        setSubmitted(true);
        if (!email || !username || !password || !passwordsMatch) return;
        onSubmit?.(email, username, password);
    };

    return (
        <Box
            component="form"
            onSubmit={handleSubmit}
            noValidate
            sx={{ display: "flex", flexDirection: "column", gap: 2, maxWidth: 360, mx: "auto", mt: 4 }}
        >
            <Typography variant="h5">Sign Up</Typography>

            <TextField
                label="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                error={submitted && !email}
                helperText={submitted && !email ? "Email is required" : ""}
                autoComplete="email"
                required
                fullWidth
            />

            <TextField
                label="Username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                error={submitted && !username}
                helperText={submitted && !username ? "Username is required" : ""}
                autoComplete="username"
                required
                fullWidth
            />

            <TextField
                label="Password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                error={submitted && !password}
                helperText={submitted && !password ? "Password is required" : ""}
                autoComplete="new-password"
                required
                fullWidth
            />

            <TextField
                label="Confirm Password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                error={showMismatch}
                helperText={showMismatch ? "Passwords do not match" : ""}
                autoComplete="new-password"
                required
                fullWidth
            />

            <Button type="submit" variant="contained" size="large">
                Sign Up
            </Button>
        </Box>
    );
}
