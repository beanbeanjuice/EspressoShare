import styles from "./LoadingComponent.module.scss";

import {Typography} from "@mui/material";

const LoadingComponent = () => {
    return (
        <div className={styles.Loading}>
            <Typography variant={"h1"}>Loading...</Typography>
        </div>
    );
}

export default LoadingComponent;
