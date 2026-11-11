import styles from "./Home.module.scss"
import {Video} from "@/generated/prisma/client";
import VideoPart from "@components/VideoPart/VideoPart";

type HomePageProps = {
    videos: Video[]
}

const HomePage = (props: HomePageProps) => {
    return (
        <div className={styles.Home}>
            <ul className={styles.VideoList}>
                {
                    props.videos
                        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
                        .map((video: Video) => (
                        <li key={video.id}>
                            <VideoPart video={video} />
                        </li>
                    ))
                }
            </ul>
        </div>
    );
}

export default HomePage;
