import { useState, useEffect, useRef } from 'react';

/**
 * useStreamingText provides a smooth typewriter effect for streaming LLM responses.
 * When isStreaming is true, text catches up smoothly character-by-character.
 * When isStreaming is false, it synchronizes immediately.
 */
export function useStreamingText(
  targetText: string,
  isStreaming: boolean,
  speedMs: number = 14
): string {
  const [displayedText, setDisplayedText] = useState(targetText);
  const targetRef = useRef(targetText);
  const displayedRef = useRef(displayedText);
  const isStreamingRef = useRef(isStreaming);

  targetRef.current = targetText;
  displayedRef.current = displayedText;
  isStreamingRef.current = isStreaming;

  // Immediate sync when not streaming
  useEffect(() => {
    if (!isStreaming) {
      setDisplayedText(targetText);
      displayedRef.current = targetText;
    }
  }, [targetText, isStreaming]);

  // Smooth typewriter ticker during streaming
  useEffect(() => {
    if (!isStreaming) return;

    const timer = setInterval(() => {
      const current = displayedRef.current;
      const target = targetRef.current;

      if (current.length < target.length) {
        const remaining = target.length - current.length;
        // Dynamic step: 1-2 chars normally, faster if backlog builds up
        const step = remaining > 100 ? 5 : remaining > 40 ? 3 : remaining > 12 ? 2 : 1;
        const nextLen = Math.min(current.length + step, target.length);
        const nextText = target.slice(0, nextLen);
        displayedRef.current = nextText;
        setDisplayedText(nextText);
      }
    }, speedMs);

    return () => clearInterval(timer);
  }, [isStreaming, speedMs]);

  return isStreaming ? displayedText : targetText;
}

export default useStreamingText;
