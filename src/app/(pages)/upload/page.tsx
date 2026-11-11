import {auth} from "@lib/auth";
import {headers} from "next/headers";
import {redirect, RedirectType} from "next/navigation";
import UploadPage from "./UploadPage";

const Page = async () => {
    const session = await auth.api.getSession({
        headers: await headers()
    });

    if (!session || !session.session) redirect('/login', RedirectType.push);

    return (
        <UploadPage />
    );
}

export default Page;
