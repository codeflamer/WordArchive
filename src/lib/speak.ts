export type PlayResult = "played" | "failed";

const VOICE_LIMIT_MS = 8000;
const AUDIO_LIMIT_MS = 15000;

function speakAloud(word: string): Promise<PlayResult> {
  return new Promise((resolve) => {
    const synth = window.speechSynthesis;
    if (!synth || typeof SpeechSynthesisUtterance === "undefined") {
      resolve("failed");
      return;
    }
    // Some phones never report the end of speech they blocked, so this can't wait forever.
    const limit = setTimeout(() => resolve("failed"), VOICE_LIMIT_MS);
    const finish = (result: PlayResult) => {
      clearTimeout(limit);
      resolve(result);
    };
    const utterance = new SpeechSynthesisUtterance(word);
    utterance.lang = "en-US";
    utterance.rate = 0.9;
    utterance.onend = () => finish("played");
    utterance.onerror = () => finish("failed");
    synth.cancel();
    synth.speak(utterance);
  });
}

function playRecording(link: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const audio = new Audio(link);
    const limit = setTimeout(() => reject(new Error("Recording took too long")), AUDIO_LIMIT_MS);
    audio.onended = () => {
      clearTimeout(limit);
      resolve();
    };
    audio.onerror = () => {
      clearTimeout(limit);
      reject(new Error("Recording failed"));
    };
    audio.play().catch((error: unknown) => {
      clearTimeout(limit);
      reject(error);
    });
  });
}

// iPhones only allow sound that starts directly from a tap, so both routes must begin before anything is awaited.
export async function playWord(word: string, recording: string | null | undefined): Promise<PlayResult> {
  if (!recording || navigator.onLine === false) return speakAloud(word);
  try {
    await playRecording(recording);
    return "played";
  } catch {
    return speakAloud(word);
  }
}
