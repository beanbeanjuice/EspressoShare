'use client';

import styles from "./Login.module.scss";
import LoginComponent from "./LoginComponent";
import {authClient} from "@lib/auth-client";

const Page = () => {
    return (
        <div className={styles.LogIn}>
            <LoginComponent onSubmit={async (username, password) => {
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

export default Page;
