type AndroidBridge = {
  saveEvidence: (dataUrl: string, mimeType: string, filename: string) => void;
  saveAuditDigest: (json: string, filename: string) => void;
};

declare global {
  interface Window {
    __GovFixBridgeNonce?: string;
    GovFixAndroid?: AndroidBridge;
  }
}

// Android sends this port only to the top-level page at the configured origin.
// The nonce prevents an embedded cross-origin frame from sending a fake ready event.
window.addEventListener("message", (event: MessageEvent) => {
  let payload: { type?: unknown; nonce?: unknown } | null = null;
  try {
    payload = typeof event.data === "string" ? JSON.parse(event.data) : event.data;
  } catch {
    return;
  }
  if (
    !payload ||
    typeof payload !== "object" ||
    payload.type !== "govfix-native-ready" ||
    typeof payload.nonce !== "string" ||
    payload.nonce !== window.__GovFixBridgeNonce ||
    !event.ports?.[0]
  ) {
    return;
  }

  const port = event.ports[0];
  window.GovFixAndroid = {
    saveEvidence(dataUrl, mimeType, filename) {
      port.postMessage(
        JSON.stringify({ type: "saveEvidence", dataUrl, mimeType, filename }),
      );
    },
    saveAuditDigest(json, filename) {
      port.postMessage(JSON.stringify({ type: "saveAuditDigest", json, filename }));
    },
  };
});

export {};
