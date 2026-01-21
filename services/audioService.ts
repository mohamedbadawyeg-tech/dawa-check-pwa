
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
  
  return new Promise<void>(resolve => setTimeout(resolve, 600)); // Wait for chime to finish
};

import { API_KEY } from './firebaseService';

// Queue System
const speechQueue: { text: string; useChime: boolean }[] = [];
let isProcessingQueue = false;

export const stopSpeech = () => {
  speechQueue.length = 0; // Clear queue
  isProcessingQueue = false;
  
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
  if (currentAudioSource) {
    try {
      currentAudioSource.stop();
    } catch (e) {}
    currentAudioSource = null;
  }
};

const processQueue = async () => {
  if (speechQueue.length === 0) {
    isProcessingQueue = false;
    return;
  }
  
  isProcessingQueue = true;
  const { text, useChime } = speechQueue[0];
  
  try {
    if (useChime) {
      await playChime();
    }
    
    await new Promise<void>((resolve) => {
      if ('speechSynthesis' in window) {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'ar-EG';
        utterance.rate = 0.9;
        utterance.pitch = 1;
        
        const voices = window.speechSynthesis.getVoices();
        const arabicVoice = voices.find(v => v.lang.includes('ar'));
        if (arabicVoice) {
          utterance.voice = arabicVoice;
        }

        utterance.onend = () => resolve();
        utterance.onerror = (e) => {
          console.error("Speech error", e);
          resolve();
        };
        
        window.speechSynthesis.speak(utterance);
      } else {
        console.warn("Browser does not support SpeechSynthesis");
        resolve();
      }
    });
  } catch (error) {
    console.error("Audio playback error:", error);
  } finally {
    speechQueue.shift();
    // Small delay between messages
    setTimeout(() => processQueue(), 500);
  }
};

export const playNotification = async (text: string, useChime: boolean = true) => {
  speechQueue.push({ text, useChime });
  if (!isProcessingQueue) {
    processQueue();
  }
};

export const speakText = async (text: string) => {
  return playNotification(text, false);
};
