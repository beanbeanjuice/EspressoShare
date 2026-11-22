'use server';

import styles from "./signup.module.scss";
import SignUpComponent from "@/app/(pages)/signup/SIgnupComponent";
import {prisma} from "@prisma";
import {redirect, RedirectType} from "next/navigation";
import {connection} from "next/server";

const Signup = async () => {
    await connection();

    const userCount = await prisma.user.count({});
    if (userCount !== 0) redirect("/login", RedirectType.push);

    return (
        <div className={styles.Signup}>
            <SignUpComponent />
        </div>
    );
}

export default Signup;
