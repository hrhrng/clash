/**
 * Generate waveform data from audio file
 * @param audioBuffer - Web Audio API AudioBuffer
 * @param samples - Number of samples to generate (default: 100)
 * @returns Array of normalized peak values (0-1)
 */
export function generateWaveform(audioBuffer: AudioBuffer, samples: number = 100): number[] {
  const rawData = audioBuffer.getChannelData(0); // Get first channel
  const blockSize = Math.floor(rawData.length / samples);
  const waveform: number[] = [];

  for (let i = 0; i < samples; i++) {
    const start = blockSize * i;
    let sum = 0;

    for (let j = 0; j < blockSize; j++) {
      sum += Math.abs(rawData[start + j]);
    }

    waveform.push(sum / blockSize);
  }

  // Normalize to 0-1 range
  const max = Math.max(...waveform);
  return waveform.map(v => v / max);
}

/**
 * Load audio file and generate waveform
 * @param url - Audio file URL
 * @param samples - Number of samples
 * @returns Promise of waveform data
 */
export async function loadAudioWaveform(url: string, samples: number = 100): Promise<number[]> {
  const audioContext = new AudioContext();
  const response = await fetch(url);
  const arrayBuffer = await response.arrayBuffer();
  const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

  return generateWaveform(audioBuffer, samples);
}
