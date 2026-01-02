
import { GoogleGenAI, Modality } from "@google/genai";

function decode(base64: string) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

let currentAudioSource: AudioBufferSourceNode | null = null;
let audioCtx: AudioContext | null = null;

const initAudioCtx = () => {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
  }
  return audioCtx;
};

export const playChime = async () => {
  const ctx = initAudioCtx();
  if (ctx.state === 'suspended') await ctx.resume();
  
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  
  osc.type = 'sine';
  osc.frequency.setValueAtTime(880, ctx.currentTime); // A5
  osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.5); // A4
  
  gain.gain.setValueAtTime(0.2, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
  
  osc.connect(gain);
  gain.connect(ctx.destination);
  
  osc.start();
  osc.stop(ctx.currentTime + 0.5);
  
  return new Promise(resolve => setTimeout(resolve, 600)); // Wait for chime to finish
};

import { API_KEY } from './firebaseService';

export const speakText = async (text: string) => {
  try {
    if (currentAudioSource) {
      currentAudioSource.stop();
      currentAudioSource = null;
    }

    // Use environment variable if valid, otherwise fallback to the exported API_KEY
    const key = (process.env.API_KEY && process.env.API_KEY !== 'PLACEHOLDER_API_KEY') 
      ? process.env.API_KEY 
      : API_KEY;

    const ai = new GoogleGenAI({ apiKey: key });
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text: `تحدث بصوت حنون، واضح، وبطيء قليلاً باللغة العربية: ${text}` }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: 'Kore' },
          },
        },
      },
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData)?.inlineData?.data;
    if (!base64Audio) return;

    const ctx = initAudioCtx();
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }

    const audioBuffer = await decodeAudioData(
      decode(base64Audio),
      ctx,
      24000,
      1
    );

    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(ctx.destination);
    source.start();
    currentAudioSource = source;
  } catch (error) {
    console.error("Audio playback error:", error);
  }
};

export const stopSpeech = () => {
  if (currentAudioSource) {
    try {
      currentAudioSource.stop();
    } catch (e) {}
    currentAudioSource = null;
  }
};
