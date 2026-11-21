export async function register() {
    if (process.env.NEXT_RUNTIME !== "nodejs") return;
    const { bootRecovery } = await import("@api/upload/Jobs");
    await bootRecovery();
}
