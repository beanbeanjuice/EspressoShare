'use server';

import styles from "./Login.module.scss";
import LoginComponent from "./LoginComponent";
import {connection} from "next/server";
import {prisma} from "@prisma";
import {redirect, RedirectType} from "next/navigation";

const Page = async () => {
    await connection();

    const userCount = await prisma.user.count({});
    if (userCount === 0) redirect("/signup", RedirectType.push);

    return (
        <div className={styles.Login}>
            <LoginComponent />
        </div>
    );
}

export default Page;
