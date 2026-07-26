import { useCallback, useEffect, useRef, useState } from "react";
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from "expo-speech-recognition";

type StopResolver = (transcript: string) => void;

export function useVoiceInput() {
  const [recording, setRecording] = useState(false);
  const [partialTranscript, setPartialTranscript] = useState("");
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const recordingRef = useRef(false);
  const transcriptRef = useRef("");
  const finalTranscriptRef = useRef("");
  const stopResolverRef = useRef<StopResolver | null>(null);
  const cancelRef = useRef(false);
  const requestIdRef = useRef(0);

  const finish = useCallback((transcript: string) => {
    recordingRef.current = false;
    setRecording(false);
    const resolve = stopResolverRef.current;
    stopResolverRef.current = null;
    resolve?.(transcript);
  }, []);

  useSpeechRecognitionEvent("result", (event) => {
    const segment = event.results[0]?.transcript ?? "";
    if (event.isFinal) {
      finalTranscriptRef.current = [finalTranscriptRef.current, segment].filter(Boolean).join(" ");
      transcriptRef.current = finalTranscriptRef.current;
    } else {
      transcriptRef.current = [finalTranscriptRef.current, segment].filter(Boolean).join(" ");
    }
    setPartialTranscript(transcriptRef.current);
  });

  useSpeechRecognitionEvent("end", () => {
    finish(cancelRef.current ? "" : transcriptRef.current);
    cancelRef.current = false;
  });

  useSpeechRecognitionEvent("error", (event) => {
    if (!cancelRef.current && event.error !== "aborted") {
      setError(event.message || "Voice input could not start. Please try again.");
    }
    finish(cancelRef.current ? "" : transcriptRef.current);
    cancelRef.current = false;
  });

  useEffect(() => {
    if (!recording) {
      return;
    }
    const timer = setInterval(() => setSeconds((current) => current + 1), 1000);
    return () => clearInterval(timer);
  }, [recording]);

  useEffect(() => {
    return () => {
      requestIdRef.current += 1;
      ExpoSpeechRecognitionModule.abort();
    };
  }, []);

  const start = useCallback(async () => {
    if (recordingRef.current) {
      return false;
    }
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setError(null);
    const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (requestId !== requestIdRef.current) {
      return false;
    }
    if (!permission.granted) {
      setError("Microphone permission is needed for voice input.");
      return false;
    }
    cancelRef.current = false;
    transcriptRef.current = "";
    finalTranscriptRef.current = "";
    setPartialTranscript("");
    setSeconds(0);
    recordingRef.current = true;
    setRecording(true);
    try {
      ExpoSpeechRecognitionModule.start({ lang: "en-IN", interimResults: true, continuous: true });
      return true;
    } catch (startError) {
      recordingRef.current = false;
      setRecording(false);
      setError(startError instanceof Error ? startError.message : "Voice input could not start. Please try again.");
      return false;
    }
  }, []);

  const stop = useCallback(() => {
    requestIdRef.current += 1;
    if (!recordingRef.current) {
      return Promise.resolve(cancelRef.current ? "" : transcriptRef.current);
    }
    return new Promise<string>((resolve) => {
      stopResolverRef.current = resolve;
      ExpoSpeechRecognitionModule.stop();
    });
  }, []);

  const cancel = useCallback(() => {
    requestIdRef.current += 1;
    if (!recordingRef.current) {
      return;
    }
    cancelRef.current = true;
    transcriptRef.current = "";
    setPartialTranscript("");
    ExpoSpeechRecognitionModule.abort();
  }, []);

  return { recording, partialTranscript, seconds, start, stop, cancel, error };
}
