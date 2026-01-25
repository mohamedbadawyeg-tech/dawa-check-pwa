
import React, { useState, useEffect } from 'react';
import { Mic, MicOff, Loader2 } from 'lucide-react';
import { SpeechRecognition } from '@capacitor-community/speech-recognition';
import { Capacitor } from '@capacitor/core';

interface VoiceCommandButtonProps {
  onCommand: (text: string) => void;
  disabled?: boolean;
}

export const VoiceCommandButton: React.FC<VoiceCommandButtonProps> = ({ onCommand, disabled }) => {
  const [isListening, setIsListening] = useState(false);
  const [recognition, setRecognition] = useState<any>(null);

  useEffect(() => {
    // Only setup Web Speech API if not native
    if (!Capacitor.isNativePlatform()) {
      if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
        const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        const recognitionInstance = new SpeechRecognition();
        recognitionInstance.continuous = false;
        recognitionInstance.lang = 'ar-EG';
        recognitionInstance.interimResults = false;

        recognitionInstance.onresult = (event: any) => {
          const text = event.results[0][0].transcript;
          console.log('Voice Command:', text);
          onCommand(text);
          setIsListening(false);
        };

        recognitionInstance.onerror = (event: any) => {
          console.error('Speech recognition error', event.error);
          setIsListening(false);
        };

        recognitionInstance.onend = () => {
          setIsListening(false);
        };

        setRecognition(recognitionInstance);
      }
    }
  }, [onCommand]);

  const toggleListening = async () => {
    if (Capacitor.isNativePlatform()) {
      try {
        if (isListening) {
          await SpeechRecognition.stop();
          setIsListening(false);
        } else {
          // Check permissions
          const status = await SpeechRecognition.checkPermissions();
          if (status.speechRecognition !== 'granted') {
             const permission = await SpeechRecognition.requestPermissions();
             if (permission.speechRecognition !== 'granted') {
                alert('يرجى السماح بصلاحية الميكروفون لاستخدام الأوامر الصوتية');
                return;
             }
          }

          setIsListening(true);
          const { matches } = await SpeechRecognition.start({
            language: 'ar-EG',
            maxResults: 1,
            prompt: 'تحدث الآن...',
            popup: false,
            partialResults: false
          });

          if (matches && matches.length > 0) {
            onCommand(matches[0]);
          }
          setIsListening(false);
        }
      } catch (e) {
        console.error("Native Speech Error:", e);
        setIsListening(false);
        // alert("حدث خطأ في التعرف على الصوت");
      }
    } else {
      // Web Logic
      if (!recognition) {
        alert('عذراً، المتصفح لا يدعم الأوامر الصوتية');
        return;
      }

      if (isListening) {
        recognition.stop();
      } else {
        recognition.start();
        setIsListening(true);
      }
    }
  };

  if (disabled) return null;

  return (
    <button
      onClick={toggleListening}
      className={`fixed bottom-4 left-4 z-40 w-14 h-14 rounded-full shadow-xl flex items-center justify-center transition-all duration-300 ${
        isListening 
          ? 'bg-red-500 animate-pulse ring-4 ring-red-200 scale-110' 
          : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:scale-105'
      }`}
    >
      {isListening ? (
        <MicOff className="w-6 h-6 text-white" />
      ) : (
        <Mic className="w-6 h-6 text-white" />
      )}
    </button>
  );
};
