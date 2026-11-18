declare module 'mux.js' {
  const muxjs: {
    mp4: {
      Transmuxer: new (opts?: Record<string, unknown>) => {
        on(event: 'data', cb: (seg: { initSegment: Uint8Array; data: Uint8Array }) => void): void;
        push(bytes: Uint8Array): void;
        flush(): void;
      };
    };
  };
  export default muxjs;
}
