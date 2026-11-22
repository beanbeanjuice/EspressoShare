import styles from "./VideoPlayer.module.scss";
import '@videojs/react/video/neutral-skin.css';

import React, {forwardRef} from "react";
import {NeutralVideoSkin, Video, VideoPlayer} from "@videojs/react/video";

type VideoPlayerProps = {
    src: string;
    autoPlay?: boolean;
    className?: string;
    controls?: boolean;
    onLoadedMetadata?: React.ReactEventHandler<HTMLVideoElement>;
    onPlay?: React.ReactEventHandler<HTMLVideoElement>;
    onTimeUpdate?: React.ReactEventHandler<HTMLVideoElement>;
}

const CustomVideoPlayer = forwardRef<HTMLVideoElement, VideoPlayerProps>((props, ref) => (
    <VideoPlayer>
            <NeutralVideoSkin
                className={[props.className, styles.VideoPlayer].join(' ')}>
                <Video
                    src={props.src}
                    playsInline
                    ref={ref}
                    className={styles.Video}
                    autoPlay={props.autoPlay}
                    // controls={props.controls ?? true}
                    onLoadedMetadata={props.onLoadedMetadata}
                    onPlay={props.onPlay}
                    onTimeUpdate={props.onTimeUpdate}
                />
            </NeutralVideoSkin>
    </VideoPlayer>
));

CustomVideoPlayer.displayName = "CustomVideoPlayer";
export default CustomVideoPlayer;
