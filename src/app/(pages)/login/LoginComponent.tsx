'use client';

import { useState } from "react";
import { Box, Button, TextField, Typography } from "@mui/material";
import {authClient} from "@lib/auth-client";
import {redirect, RedirectType, useRouter} from "next/navigation";

const LoginComponent = () => {
    const router = useRouter();
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [submitted, setSubmitted] = useState(false);

    const handleSubmit = (e: any) => {
        e.preventDefault();
        setSubmitted(true);
        if (!username || !password) return;
        onSubmit?.(username, password);
    };

    const onSubmit = async (username: string, password: string) => {
        const { data, error } = await authClient.signIn.username({
            username: username,
            password: password, // user password -> min 8 characters by default
            callbackURL: "/" // A URL to redirect to after the user verifies their email (optional)
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
                Log In
            </Button>
        </Box>
    );
}

export default LoginComponent;
