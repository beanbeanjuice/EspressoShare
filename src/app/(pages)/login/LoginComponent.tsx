'use client';

import { useState } from "react";
import { Box, Button, TextField, Typography } from "@mui/material";

interface LogInProps {
    onSubmit?: (username: string, password: string) => void;
}

export default function LoginComponent({ onSubmit }: LogInProps) {
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [submitted, setSubmitted] = useState(false);

    const handleSubmit = (e: any) => {
        e.preventDefault();
        setSubmitted(true);
        if (!username || !password) return;
        onSubmit?.(username, password);
    };

    return (
        <Box
            component="form"
            onSubmit={handleSubmit}
            noValidate
            sx={{ display: "flex", flexDirection: "column", gap: 2, maxWidth: 360, mx: "auto", mt: 4 }}
        >
            <Typography variant="h5">Log In</Typography>

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

            <Button type="submit" variant="contained" size="large">
                Sign Up
            </Button>
        </Box>
    );
}
