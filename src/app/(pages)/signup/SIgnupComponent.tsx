'use client';

import { useState } from "react";
import { Box, Button, TextField, Typography } from "@mui/material";
import {authClient} from "@lib/auth-client";
import {useRouter} from "next/navigation";

export default function SignUpComponent() {
    const router = useRouter();

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

    const onSubmit = async (email: string, username: string, password: string) => {
        const { data, error } = await authClient.signUp.email({
            email: email, // user email address
            username: username,
            password: password, // user password -> min 8 characters by default
            name: "", // user display name
            image: undefined, // User image URL (optional)
            callbackURL: "/dashboard" // A URL to redirect to after the user verifies their email (optional)
        }, {
            onRequest: (ctx) => {
                //show loading
            },
            onSuccess: (ctx) => {
                //redirect to the dashboard or sign in page
                router.push("/");
                router.refresh();
            },
            onError: (ctx) => {
                // display the error message
                alert(ctx.error.message);
            },
        });
    }

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
