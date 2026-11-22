'use client';

import styles from "./VideoPart.module.scss";
import {
    Button, Card,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    IconButton,
    LinearProgress,
    Menu,
    MenuItem,
    TextField,
    Typography,
} from "@mui/material";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutlined";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import CheckIcon from "@mui/icons-material/Check";
import VisibilityIcon from "@mui/icons-material/Visibility";
import LocalDate from "@components/LocalDate";
import {MAX_DESCRIPTION_LENGTH, MAX_TITLE_LENGTH} from "@lib/limits";
import {Video} from "@/generated/prisma/browser";
import {VideoStatus} from "@/generated/prisma/enums";
import {useRouter} from "next/navigation";
import React from "react";
import Link from "next/link";

type VideoPartProps = {
    video: Video;
    viewCount: number;
    liveStatus?: string;
    liveProgress?: number;
    liveError?: string | null;
};

const HOVER_DELAY_MS = 250; // don't load videos when the mouse just sweeps across the grid

// A small translucent background so the overlay buttons are legible on any thumbnail.
const overlayButtonSx = {
    backgroundColor: "rgba(0, 0, 0, 0.55)",
    color: "white",
    "&:hover": { backgroundColor: "rgba(0, 0, 0, 0.75)" },
};

const VideoPart = (props: VideoPartProps) => {
    const status = props.liveStatus ?? props.video.status;

    if (status !== VideoStatus.READY) return <PlaceholderCard {...props} status={status} />;

    return <ReadyCard video={props.video} viewCount={props.viewCount} />;
};

type PlaceholderProps = VideoPartProps & { status: string };

const PlaceholderCard = ({video, status, liveProgress, liveError}: PlaceholderProps) => {
    const pct = Math.round(((liveProgress ?? 0) * 100));
    const failed = status === VideoStatus.FAILED;

    return (
        <div className={styles.Part}>
            <Card
                className={styles.MediaWrapper}
                sx={{
                    bgcolor: failed ? "error.dark" : "info.dark",
                    color: "common.white",
                }}
            >
                <div className={styles.Media}>
                    <div className={styles.Placeholder}>
                        {failed ? (
                            <FailedCard video={video} error={liveError} />
                        ) : (
                            <>
                                <Typography variant="body2">Processing… {pct}%</Typography>
                                <LinearProgress
                                    variant="determinate"
                                    value={pct}
                                    sx={{width: "80%", mt: 1}}
                                />
                            </>
                        )}
                    </div>
                </div>

                <div className={styles.MediaWrapper_CardDescription}>
                    <Typography variant="body1" className={styles.Title} title={video.title}>
                        {video.title}
                    </Typography>

                    <div className={styles.MediaWrapper_CardDescription_Extras}>
                        <Typography variant="body2">
                            <LocalDate date={video.createdAt} />
                        </Typography>

                        <Typography variant="body2">
                            <span style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem", whiteSpace: "nowrap" }}>
                                <VisibilityIcon fontSize="inherit" />
                                0 views {/* Just show a default of 0 */}
                            </span>
                        </Typography>
                    </div>
                </div>
            </Card>
        </div>
    );
};

type FailedCardProps = { video: Video; error?: string | null };

const FailedCard = ({video, error}: FailedCardProps) => {
    const router = useRouter();
    const [busy, setBusy] = React.useState(false);

    const onDelete = async () => {
        if (busy) return;
        if (!window.confirm("Delete this failed video?")) return;
        setBusy(true);
        try {
            const res = await fetch(`/api/transcode/${video.id}`, { method: "DELETE" });
            if (res.ok) router.refresh();
            else {
                const body = await res.text().catch(() => "");
                window.alert(`Could not delete video (${res.status}): ${body}`);
                setBusy(false);
            }
        } catch {
            window.alert("Network error");
            setBusy(false);
        }
    };

    return (
        <>
            <Typography variant="body2">Failed</Typography>
            {error && (
                <Typography variant="caption" sx={{opacity: 0.7, mt: 0.5}}>
                    {error.length > 140 ? `${error.slice(0, 140)}…` : error}
                </Typography>
            )}
            <Button
                variant="outlined"
                color="error"
                size="small"
                onClick={onDelete}
                disabled={busy}
                sx={{mt: 1}}
            >
                {busy ? "Deleting…" : "Delete"}
            </Button>
        </>
    );
};

const ReadyCard = ({video, viewCount}: {video: Video; viewCount: number}) => {
    const router = useRouter();
    const [active, setActive] = React.useState(false);   // video element mounted
    const [playing, setPlaying] = React.useState(false); // first frame is actually showing
    const timer = React.useRef<number | undefined>(undefined);

    // Overlay interaction state.
    const [menuAnchor, setMenuAnchor] = React.useState<HTMLElement | null>(null);
    const [deleting, setDeleting] = React.useState(false);
    const [copied, setCopied] = React.useState(false);

    // Edit dialog state.
    const [editOpen, setEditOpen] = React.useState(false);
    const [title, setTitle] = React.useState(video.title);
    const [description, setDescription] = React.useState(video.description);
    const [saving, setSaving] = React.useState(false);
    const [editError, setEditError] = React.useState<string | null>(null);

    const start = () => {
        window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => setActive(true), HOVER_DELAY_MS);
    };

    const stop = () => {
        window.clearTimeout(timer.current);
        setActive(false);
        setPlaying(false);
    };

    React.useEffect(() => () => window.clearTimeout(timer.current), []);

    // Prevent the surrounding <Link> from navigating when we click an overlay.
    const stopLink = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
    };

    const onDelete = async (e: React.MouseEvent) => {
        stopLink(e);
        if (deleting) return;
        if (!window.confirm(`Delete "${video.title}"?`)) return;
        setDeleting(true);
        try {
            const res = await fetch(`/api/video/${video.id}`, { method: "DELETE" });
            if (res.ok) {
                router.refresh();
            } else {
                const body = await res.text().catch(() => "");
                window.alert(`Could not delete video (${res.status}): ${body}`);
                setDeleting(false);
            }
        } catch {
            window.alert("Network error");
            setDeleting(false);
        }
    };

    const onCopy = (e: React.MouseEvent) => {
        stopLink(e);
        void navigator.clipboard.writeText(`${window.location.origin}/watch/${video.id}`);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1500);
    };

    const onMore = (e: React.MouseEvent<HTMLButtonElement>) => {
        stopLink(e);
        setMenuAnchor(e.currentTarget);
    };

    const closeMenu = () => setMenuAnchor(null);

    const openEdit = () => {
        setTitle(video.title);
        setDescription(video.description);
        setEditError(null);
        setSaving(false);
        closeMenu();
        setEditOpen(true);
    };

    const closeEdit = () => {
        if (saving) return;
        setEditOpen(false);
    };

    const trimmedTitle = title.trim();
    const canSave = trimmedTitle.length > 0 && !saving;

    const save = async () => {
        if (!canSave) return;
        setSaving(true);
        setEditError(null);
        try {
            const res = await fetch(`/api/video/${video.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ title: trimmedTitle, description }),
            });
            if (!res.ok) {
                const body = await res.text().catch(() => "");
                setEditError(body || `Could not save (${res.status})`);
                setSaving(false);
                return;
            }
            setEditOpen(false);
            setSaving(false);
            router.refresh();
        } catch {
            setEditError("Network error");
            setSaving(false);
        }
    };

    return (
        <>
            <Link
                className={styles.Part}
                href={`/watch/${video.id}`}
                onPointerEnter={start}
                onPointerLeave={stop}
            >
                <Card className={styles.MediaWrapper}>
                    <div className={styles.Media}>
                        <img
                            className={styles.Thumbnail}
                            src={`/api/thumbnails/${video.id}.webp`}
                            alt={`Thumbnail for ${video.title}`}
                            loading="lazy"
                        />
                        {active && (
                            <HoverPreview
                                src={`/api/videos/${video.fileUrl}`}
                                visible={playing}
                                onPlaying={() => setPlaying(true)}
                            />
                        )}
                        <IconButton
                            size="small"
                            className={`${styles.Overlay} ${styles.OverlayTopLeft}`}
                            sx={overlayButtonSx}
                            onClick={onDelete}
                            title="Delete"
                            aria-label="Delete video"
                        >
                            <DeleteOutlineIcon fontSize="small" />
                        </IconButton>
                        <IconButton
                            size="small"
                            className={`${styles.Overlay} ${styles.OverlayTopRight}`}
                            sx={overlayButtonSx}
                            onClick={onCopy}
                            title={copied ? "Link copied" : "Copy link"}
                            aria-label="Copy link"
                        >
                            {copied ? <CheckIcon fontSize="small" /> : <ContentCopyIcon fontSize="small" />}
                        </IconButton>
                        <IconButton
                            size="small"
                            className={`${styles.Overlay} ${styles.OverlayBottomRight}`}
                            sx={overlayButtonSx}
                            onClick={onMore}
                            title="More"
                            aria-label="More options"
                        >
                            <MoreVertIcon fontSize="small" />
                        </IconButton>
                    </div>

                    <div
                        className={styles.MediaWrapper_CardDescription}
                    >
                        <Typography
                            variant="body1"
                            className={styles.Title}
                            title={video.title}
                        >
                            {video.title}
                        </Typography>

                        <div
                            className={styles.MediaWrapper_CardDescription_Extras}
                        >
                            <Typography
                                variant="body2"
                                color="secondary"
                            >
                                <LocalDate date={video.createdAt} />
                            </Typography>

                            <Typography
                                variant="body2"
                                color="secondary"
                            >
                                <span style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem", whiteSpace: "nowrap" }}>
                                <VisibilityIcon fontSize="inherit" />
                                    {viewCount.toLocaleString()} {viewCount === 1 ? "view" : "views"}
                            </span>
                            </Typography>
                        </div>
                    </div>
                </Card>
            </Link>
            <Menu anchorEl={menuAnchor} open={!!menuAnchor} onClose={closeMenu}>
                <MenuItem onClick={openEdit}>Edit</MenuItem>
            </Menu>
            <Dialog open={editOpen} onClose={closeEdit} fullWidth maxWidth="sm">
                <DialogTitle>Edit video</DialogTitle>
                <DialogContent>
                    <TextField
                        label="Title"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        slotProps={{htmlInput: {maxLength: MAX_TITLE_LENGTH}}}
                        helperText={`${title.length}/${MAX_TITLE_LENGTH}`}
                        fullWidth
                        required
                        margin="dense"
                        disabled={saving}
                    />
                    <TextField
                        label="Description"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        slotProps={{htmlInput: {maxLength: MAX_DESCRIPTION_LENGTH}}}
                        fullWidth
                        multiline
                        minRows={3}
                        margin="dense"
                        disabled={saving}
                    />
                    {editError && (
                        <Typography variant="caption" color="error" sx={{mt: 1, display: "block"}}>
                            {editError}
                        </Typography>
                    )}
                </DialogContent>
                <DialogActions>
                    <Button onClick={closeEdit} disabled={saving}>Cancel</Button>
                    <Button onClick={save} disabled={!canSave} variant="contained">
                        {saving ? "Saving…" : "Save"}
                    </Button>
                </DialogActions>
            </Dialog>
        </>
    );
};

type HoverPreviewProps = {
    src: string;
    visible: boolean;
    onPlaying: () => void;
};

const HoverPreview = ({ src, visible, onPlaying }: HoverPreviewProps) => {
    const ref = React.useRef<HTMLVideoElement>(null);

    React.useEffect(() => {
        const v = ref.current;
        return () => {
            if (!v) return;
            v.pause();
            v.removeAttribute("src");
            v.load();
        };
    }, []);

    return (
        <video
            ref={ref}
            className={`${styles.Preview} ${visible ? styles.Visible : ""}`}
            src={src}
            autoPlay
            muted
            loop
            playsInline
            preload="auto"
            onPlaying={onPlaying}
        />
    );
};

export default VideoPart;
