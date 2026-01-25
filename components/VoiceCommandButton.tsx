
import React, { useState, useEffect } from 'react';
import { Mic, MicOff, Loader2 } from 'lucide-react';

interface VoiceCommandButtonProps {
  onCommand: (text: string) => void;
  disabled?: boolean;
}

export const VoiceCommandButton: React.FC<VoiceCommandButtonProps> = ({ onCommand, disabled }) => {
  const [isListening, setIsListening] = useState(false);
  const [recognition, setRecognition] = useState<any>(null);

  useEffect(() => {
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
  }, [onCommand]);

  const toggleListening = () => {
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
