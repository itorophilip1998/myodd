'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useUiSound } from '@/components/SettingsProvider';

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
};

type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
};

function getSpeechRecognition(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === 'undefined') return null;
  const w = window as Window & {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function useSpeechDictation(onFinal: (text: string) => void) {
  const play = useUiSound();
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');
  const [supported, setSupported] = useState(false);
  const [error, setError] = useState('');
  const recognition = useRef<SpeechRecognitionLike | null>(null);
  const onFinalRef = useRef(onFinal);
  const listeningRef = useRef(false);
  const restartingRef = useRef(false);
  onFinalRef.current = onFinal;

  useEffect(() => {
    setSupported(!!getSpeechRecognition());
    return () => {
      listeningRef.current = false;
      recognition.current?.abort();
      recognition.current = null;
    };
  }, []);

  const stop = useCallback(() => {
    listeningRef.current = false;
    restartingRef.current = false;
    recognition.current?.stop();
    recognition.current = null;
    setListening(false);
    setInterim('');
    play('mic-off');
  }, [play]);

  const start = useCallback(() => {
    const Ctor = getSpeechRecognition();
    if (!Ctor) {
      setError('Voice input isn’t supported in this browser. Try Chrome or Edge.');
      play('error');
      return;
    }
    setError('');
    setInterim('');
    recognition.current?.abort();
    const session = new Ctor();
    session.continuous = true;
    session.interimResults = true;
    session.lang = 'en-NG';
    session.onresult = event => {
      let finalChunk = '';
      let live = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const text = result[0].transcript;
        if (result.isFinal) finalChunk += text;
        else live += text;
      }
      setInterim(live.trim());
      const text = finalChunk.trim();
      if (text) {
        play('prompt');
        onFinalRef.current(text);
      }
    };
    session.onerror = event => {
      if (event.error === 'aborted' || event.error === 'no-speech') return;
      if (event.error === 'not-allowed') setError('Microphone permission was blocked.');
      else setError('Could not capture voice. Try again.');
      play('error');
      listeningRef.current = false;
      restartingRef.current = false;
      setListening(false);
      setInterim('');
    };
    session.onend = () => {
      // Browsers end continuous sessions after a pause — keep listening until the user stops.
      if (listeningRef.current && !restartingRef.current) {
        restartingRef.current = true;
        try {
          session.start();
          restartingRef.current = false;
          return;
        } catch {
          restartingRef.current = false;
        }
      }
      if (!listeningRef.current) {
        setListening(false);
        setInterim('');
      }
    };
    recognition.current = session;
    try {
      session.start();
      listeningRef.current = true;
      setListening(true);
      play('mic-on');
    } catch {
      setError('Could not start the microphone.');
      listeningRef.current = false;
      setListening(false);
      setInterim('');
      play('error');
    }
  }, [play]);

  const toggle = useCallback(() => {
    if (listening) stop();
    else start();
  }, [listening, start, stop]);

  return { listening, interim, supported, error, setError, toggle, stop };
}
