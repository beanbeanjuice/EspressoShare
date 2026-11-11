'use client';

import styles from "./signup.module.scss";
import SignUpComponent from "@/app/(pages)/signup/SIgnupComponent";
import {authClient} from "@lib/auth-client";

const Signup = () => {
    return (
        <div className={styles.Signup}>
            <SignUpComponent onSubmit={async (email, username, password) => {
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
                    },
                    onError: (ctx) => {
                        // display the error message
                        alert(ctx.error.message);
                    },
                });
            }} />
        </div>
    );
}

export default Signup;
