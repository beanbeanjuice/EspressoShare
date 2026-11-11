'use server';

import styles from "./Footer.module.scss";
import {Typography} from "@mui/material";
import {cacheLife} from "next/cache";

const Footer = async () => {
    "use cache";
    cacheLife("days");

    return (
        <footer className={[styles.Main].join(" ")}>
            <Typography
                variant={"body1"}
                color={"primary"}
            >
                Copyright © {new Date().getFullYear()} beanbeanjuice. All Rights Reserved. Made with ❤ by <a
                href="https://beanbeanjuice.com/"
                target="_blank"
                rel={"noreferrer"}>beanbeanjuice</a>. v{process.env.NEXT_PUBLIC_WEBSITE_VERSION}.
            </Typography>
        </footer>
    );
}

export default Footer;
