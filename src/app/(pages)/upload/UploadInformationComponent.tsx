import styles from "./UploadInformationComponent.module.scss";

import {Box, Button, TextareaAutosize, TextField, Typography} from "@mui/material";
import {useState} from "react";

type UploadInformationProps = {
    onSubmit?: (title: string, description: string) => void;
}

const UploadInformationComponent = (props: UploadInformationProps) => {
    const [title, setTitle] = useState("");
    const [description, setDescription] = useState("");
    const [submitted, setSubmitted] = useState(false);

    const handleSubmit = (e: any) => {
        e.preventDefault();
        setSubmitted(true);
        if (!title) return;
        props.onSubmit?.(title, description);
    };

    return (
        <Box
            component="form"
            onSubmit={handleSubmit}
            noValidate
            className={styles.Component}
        >
            <Typography variant={"h5"}>Upload Video</Typography>

            <TextField
                className={styles.Input}
                label="Title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                error={submitted && !title}
                helperText={submitted && !title ? "Title is required" : ""}
                autoComplete="title"
                required
                fullWidth
            />

            <TextField
                className={styles.Input}
                label="Description"
                multiline={true}
                value={description}
                minRows={4}
                maxRows={16}
                onChange={(e) => setDescription(e.target.value)}
                autoComplete="description"
                fullWidth
            />

            <Button type="submit" variant="contained" size="large">
                Upload
            </Button>
        </Box>
    );
}

export default UploadInformationComponent;
