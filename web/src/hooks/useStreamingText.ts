/** Display provider text as it arrives, without adding artificial response latency. */
export function useStreamingText(targetText: string, _isStreaming: boolean, _speedMs = 14): string {
  return targetText;
}
export default useStreamingText;
