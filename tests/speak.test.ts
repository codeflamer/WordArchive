import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { playWord } from "../src/lib/speak";

type FakeAudio = { play: ReturnType<typeof vi.fn>; onended?: () => void; onerror?: () => void };

describe("playing a word", () => {
  let audios: FakeAudio[];
  let links: string[];
  let playBehaviour: () => Promise<void>;
  let spoken: { text: string; lang?: string; onend?: () => void; onerror?: () => void }[];
  let voice: { cancel: ReturnType<typeof vi.fn>; speak: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    audios = [];
    links = [];
    spoken = [];
    playBehaviour = () => Promise.resolve();
    vi.stubGlobal(
      "Audio",
      class {
        play = vi.fn(() => playBehaviour());
        constructor(link: string) {
          links.push(link);
          audios.push(this);
        }
      },
    );
    vi.stubGlobal(
      "SpeechSynthesisUtterance",
      class {
        constructor(public text: string) {}
      },
    );
    voice = { cancel: vi.fn(), speak: vi.fn((utterance) => spoken.push(utterance)) };
    vi.stubGlobal("speechSynthesis", voice);
    Object.defineProperty(window, "speechSynthesis", { value: voice, configurable: true });
    vi.stubGlobal("navigator", { onLine: true });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    Object.defineProperty(window, "speechSynthesis", { value: undefined, configurable: true });
  });

  it("plays the recording when there is one", async () => {
    const played = playWord("sanction", "https://example.test/a.mp3");
    expect(links).toEqual(["https://example.test/a.mp3"]);
    await vi.waitFor(() => expect(audios[0].play).toHaveBeenCalled());
    audios[0].onended?.();
    expect(await played).toBe("played");
    expect(voice.speak).not.toHaveBeenCalled();
  });

  it("starts the sound straight from the tap, as iPhones require", () => {
    void playWord("sanction", "https://example.test/a.mp3");
    expect(audios[0].play).toHaveBeenCalled();
    void playWord("sanction", null);
    expect(voice.speak).toHaveBeenCalled();
  });

  it("uses the phone's voice when there's no recording", async () => {
    const played = playWord("pulchritude", null);
    expect(spoken[0].text).toBe("pulchritude");
    expect(spoken[0].lang).toBe("en-US");
    spoken[0].onend?.();
    expect(await played).toBe("played");
    expect(links).toEqual([]);
  });

  it("uses the phone's voice with no signal, without trying the recording", async () => {
    vi.stubGlobal("navigator", { onLine: false });
    const played = playWord("sanction", "https://example.test/a.mp3");
    expect(links).toEqual([]);
    spoken[0].onend?.();
    expect(await played).toBe("played");
  });

  it("falls back to the voice when a recording won't start", async () => {
    playBehaviour = () => Promise.reject(new Error("blocked"));
    const played = playWord("sanction", "https://example.test/a.mp3");
    await vi.waitFor(() => expect(spoken).toHaveLength(1));
    spoken[0].onend?.();
    expect(await played).toBe("played");
  });

  it("falls back to the voice when a recording fails partway", async () => {
    const played = playWord("sanction", "https://example.test/a.mp3");
    audios[0].onerror?.();
    await vi.waitFor(() => expect(spoken).toHaveLength(1));
    spoken[0].onend?.();
    expect(await played).toBe("played");
  });

  it("reports failure when the voice errors", async () => {
    const played = playWord("sanction", null);
    spoken[0].onerror?.();
    expect(await played).toBe("failed");
  });

  it("reports failure when the voice never finishes", async () => {
    vi.useFakeTimers();
    const played = playWord("sanction", null);
    await vi.advanceTimersByTimeAsync(8000);
    expect(await played).toBe("failed");
  });

  it("reports failure when the device has no voice", async () => {
    Object.defineProperty(window, "speechSynthesis", { value: undefined, configurable: true });
    expect(await playWord("sanction", null)).toBe("failed");
  });
});
