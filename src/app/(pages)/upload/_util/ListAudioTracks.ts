import { Input, ALL_FORMATS, BlobSource } from 'mediabunny';

export type CustomAudioTrack = {
    id: number;
    number: number;
    name: string;
    codec: string;
    sampleRate: number;
    bitrate: number;
}

const ConvertToInput = (file: File) => {
    return new Input({
        source: new BlobSource(file),
        formats: ALL_FORMATS,
    });
}

const GetAudioTracks = async (file: File): Promise<CustomAudioTrack[]> => {
    const audioTracks = await ConvertToInput(file).getAudioTracks();

    const mappedTracks = audioTracks.map(async (track) => {
        return {
            id: track.id,
            number: track.number,
            name: await track.getName(),
            codec: await track.getCodec(),
            sampleRate: await track.getSampleRate(),
            bitrate: await track.getBitrate(),
        } as CustomAudioTrack;
    });

    return Promise.all(mappedTracks);
}

export default GetAudioTracks;
