import React, { useState, useEffect, useRef } from 'react';

export type GenieOutput = {
  id: string;
  category: string; // e.g., "Summary", "Actions", "Script", "Audio"
  content: string; // text content
  audioUrl?: string; // optional audio playback URL
  metadata?: Record<string, any>; // must include source/platform claims
};

export type GenieResponse = {
  requestId: string;
  outputs: GenieOutput[];
  metadata?: {
    platform?: string; // expected to be 'bigo_live'
    verified?: boolean; // whether backend verified source
    [k: string]: any;
  };
};

// Helper to validate that a response is Bigo Live verified
function isValidBigoResponse(resp?: GenieResponse) {
  if (!resp) return false;
  const platform = resp.metadata?.platform || resp.outputs?.[0]?.metadata?.platform || resp.outputs?.[0]?.metadata?.source;
  const verified = resp.metadata?.verified;
  // Enforce that platform explicitly signals bigo_live and that backend verified the origin if provided
  return platform === 'bigo_live' || platform === 'bigo-live' || verified === true;
}

const BeanGenieTurbo: React.FC = () => {
  const [query, setQuery] = useState('');
  const [response, setResponse] = useState<GenieResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [sideBySide, setSideBySide] = useState(false);
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    // Setup SpeechRecognition (optional) — graceful fallback if not available
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      const r = new SpeechRecognition();
      r.continuous = false;
      r.interimResults = false;
      r.lang = 'en-US';
      r.onresult = (ev: any) => {
        const text = ev.results?.[0]?.[0]?.transcript;
        if (text) {
          setQuery((q) => (q ? q + ' ' + text : text));
        }
        setListening(false);
      };
      r.onerror = () => setListening(false);
      recognitionRef.current = r;
    }
  }, []);

  async function sendQuery(payload: { text?: string; audioBlob?: Blob | null }) {
    setError(null);
    setResponse(null);

    // Prepare form data for optional audio upload
    try {
      const form = new FormData();
      if (payload.text) form.append('text', payload.text);
      if (payload.audioBlob) form.append('audio', payload.audioBlob, 'input.webm');

      // This endpoint is a placeholder — your backend should implement verification that the returned
      // outputs are sourced/verified from Bigo Live. The client enforces a check on the response metadata
      // and will reject any payload that is not explicitly labeled/verified for 'bigo_live'.
      const res = await fetch('/api/bean-genie/process', {
        method: 'POST',
        body: form,
      });

      if (!res.ok) {
        const t = await res.text();
        throw new Error(t || 'Server error');
      }

      const json: GenieResponse = await res.json();

      if (!isValidBigoResponse(json)) {
        setError('Rejected response: the backend did not mark this data as verified for Bigo Live. BeanGenie Turbo will not show unverified or general-purpose model content for Bigo Live strategy.');
        return;
      }

      setResponse(json);
      setActiveIndex(0);
    } catch (err: any) {
      setError(err?.message || String(err));
    }
  }

  function startListening() {
    const r = recognitionRef.current;
    if (!r) return setError('Voice input not supported in this browser');
    setListening(true);
    r.start();
  }

  function stopListening() {
    const r = recognitionRef.current;
    if (!r) return;
    r.stop();
    setListening(false);
  }

  function onSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    if (!query?.trim()) return setError('Please enter a query');
    sendQuery({ text: query.trim(), audioBlob: null });
  }

  return (
    <div className="bean-genie-turbo">
      <h2>BeanGenie Turbo</h2>
      <p className="muted">Coach + Voice — outputs are dynamic windows. Only verified Bigo Live strategy data will be displayed.</p>

      <form onSubmit={onSubmit}>
        <div>
          <textarea value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Ask about Bigo Live strategy (be specific, small details matter)..." rows={4} />
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <button type="submit">Ask</button>
          <button type="button" onClick={() => (listening ? stopListening() : startListening())}>{listening ? 'Stop' : 'Voice'}</button>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <input type="checkbox" checked={sideBySide} onChange={(e) => setSideBySide(e.target.checked)} /> Side-by-side
          </label>
        </div>
      </form>

      {error && <div className="error" role="alert">{error}</div>}

      {response && (
        <div className="outputs">
          <div className="controls" style={{ marginTop: 12 }}>
            <div className="tabs">
              {response.outputs.map((o, i) => (
                <button key={o.id} onClick={() => setActiveIndex(i)} aria-pressed={activeIndex === i}>
                  {o.category}
                </button>
              ))}
            </div>
          </div>

          <div className={`windows ${sideBySide ? 'side-by-side' : 'single'}`} style={{ marginTop: 12 }}>
            {sideBySide ? (
              response.outputs.map((o, i) => (
                <div key={o.id} className="window" style={{ flex: 1, padding: 8, border: '1px solid #eee', margin: 4 }}>
                  <h4>{o.category}</h4>
                  <pre style={{ whiteSpace: 'pre-wrap' }}>{o.content}</pre>
                  {o.audioUrl && (
                    <audio controls src={o.audioUrl} />
                  )}
                </div>
              ))
            ) : (
              <div className="window" style={{ padding: 8, border: '1px solid #eee' }}>
                <h4>{response.outputs[activeIndex]?.category}</h4>
                <pre style={{ whiteSpace: 'pre-wrap' }}>{response.outputs[activeIndex]?.content}</pre>
                {response.outputs[activeIndex]?.audioUrl && <audio controls src={response.outputs[activeIndex]?.audioUrl} />}
              </div>
            )}
          </div>

          <div style={{ marginTop: 10, fontSize: 12, color: '#666' }}>
            <strong>Note:</strong> BeanGenie Turbo enforces that the backend return outputs explicitly verified for the "bigo_live" platform. This prevents the product from surfacing made-up or generic model content for the Bigo Live strategy domain. If you control the backend, please ensure the response metadata includes metadata.platform = "bigo_live" or metadata.verified = true and the outputs include source/platform metadata.
          </div>
        </div>
      )}
    </div>
  );
};

export default BeanGenieTurbo;