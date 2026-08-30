import { File, Paths } from 'expo-file-system';

export interface ToneOptions {
  frequency: number;
  durationSeconds: number;
  volume?: number;
  sampleRate?: number;
}

function buildWavBytes(
  frequency: number,
  durationSeconds: number,
  sampleRate: number,
  volume: number
): Uint8Array {
  const numSamples = Math.floor(sampleRate * durationSeconds);
  const dataSize = numSamples * 2;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);

  const envelopeSamples = Math.floor(sampleRate * 0.05);
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    let sample = Math.sin(2 * Math.PI * frequency * t) * volume * 32767;
    if (i < envelopeSamples) {
      sample *= i / envelopeSamples;
    } else if (i > numSamples - envelopeSamples) {
      sample *= (numSamples - i) / envelopeSamples;
    }
    view.setInt16(44 + i * 2, sample, true);
  }

  return new Uint8Array(buffer);
}

export async function createToneFile(options: ToneOptions): Promise<string> {
  const sampleRate = options.sampleRate ?? 44100;
  const volume = options.volume ?? 0.8;
  const file = new File(Paths.cache, `tone-${options.frequency}-${Date.now()}.wav`);
  if (file.exists) {
    file.delete();
  }
  file.create({ overwrite: true, intermediates: true });
  const bytes = buildWavBytes(options.frequency, options.durationSeconds, sampleRate, volume);
  file.write(bytes);
  return file.uri;
}
