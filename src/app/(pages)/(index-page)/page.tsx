import {prisma} from "@prisma";
import {notFound, redirect, RedirectType} from "next/navigation";
import {auth} from "@lib/auth";
import {headers} from "next/headers";
import HomePage from "@/app/(pages)/(index-page)/HomePage";
import {connection} from "next/server";

const Page = async () => {
  await connection();
  const session = await auth.api.getSession({
    headers: await headers()
  });

  if (!session || !session.session) redirect('/login', RedirectType.push);

  const videos = await prisma.video.findMany({
    where: {
      userId: session.session.userId,
    }
  });

  return (
      <HomePage videos={videos} />
  )
}

export default Page;
