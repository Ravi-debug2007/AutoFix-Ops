import React, { useState } from 'react';
import { Send, CheckCircle2, AlertCircle, RefreshCw, Terminal, Layers, ArrowRight } from 'lucide-react';
import { ErrorEvent } from '../types';

interface WebhookSimulatorTabProps {
  onNavigateToEvent: (event: ErrorEvent) => void;
  events: ErrorEvent[];
}

export const WebhookSimulatorTab: React.FC<WebhookSimulatorTabProps> = ({
  onNavigateToEvent,
  events,
}) => {
  const [selectedPreset, setSelectedPreset] = useState<string>('sentry_null_pointer');
  const [responseLog, setResponseLog] = useState<string>('');
  const [isSending, setIsSending] = useState(false);
  const [lastEventId, setLastEventId] = useState<string | null>(null);

  const presets = [
    {
      id: 'sentry_null_pointer',
      name: 'Sentry: TypeError in User Profile (Standard)',
      endpoint: '/api/webhooks/sentry',
      payload: {
        event_id: 'sentry_evt_' + Date.now(),
        project: 'ecommerce-core',
        title: 'TypeError: Cannot read properties of undefined (reading "email")',
        culprit: '/var/task/app/src/services/userService.ts',
        event: {
          exception: {
            values: [
              {
                type: 'TypeError',
                value: 'Cannot read properties of undefined (reading "email")',
                stacktrace: {
                  frames: [
                    { filename: '/var/task/app/src/index.ts', lineno: 42, function: 'handleRequest' },
                    { filename: '/var/task/app/src/services/userService.ts', lineno: 88, function: 'fetchUserProfile' },
                  ],
                },
              },
            ],
          },
        },
      },
    },
    {
      id: 'github_workflow_fail',
      name: 'GitHub Actions: CI Test Run Failure',
      endpoint: '/api/webhooks/github',
      payload: {
        action: 'completed',
        workflow_run: {
          id: Date.now(),
          name: 'Integration Test Suite',
          head_branch: 'main',
          run_number: 142,
          conclusion: 'failure',
        },
        repository: {
          full_name: 'acme/billing-service',
        },
        error_type: 'AssertionError',
        message: 'Expected invoice status "PAID" but received "PENDING"',
        file_path: 'C:\\Users\\runner\\workspace\\src\\billing\\invoice.ts',
        line_number: 104,
        stack_trace: 'AssertionError: Expected "PAID" but got "PENDING"\n  at InvoiceEngine.verifyPayment (/workspace/src/billing/invoice.ts:104)\n  at Suite.run (/workspace/tests/billing.test.ts:32)',
      },
    },
    {
      id: 'gatekeeper_denylist_test',
      name: 'Guardrail Test: Protected File Violation (auth/secrets.ts)',
      endpoint: '/api/ingest/logs',
      payload: {
        errorType: 'SecretDecryptionError',
        message: 'Failed to decrypt RSA private key for JWT signature',
        filePath: 'src/auth/secrets/keys.pem',
        lineNumber: 12,
        stackTrace: 'Error: Key corrupt\n  at loadKey (src/auth/secrets/keys.pem:12)',
        repository: 'acme/core-api',
      },
    },
    {
      id: 'custom_log_shipper',
      name: 'Log Shipper: Database Connection Timeout',
      endpoint: '/api/ingest/logs',
      payload: {
        errorType: 'ConnectionTimeoutError',
        message: 'Connection pool exhausted after 5000ms waiting for available client',
        filePath: 'src/db/connectionPool.ts',
        lineNumber: 47,
        stackTrace: 'ConnectionTimeoutError: Pool exhausted\n  at acquireConnection (src/db/connectionPool.ts:47)',
        repository: 'acme/analytics-store',
      },
    },
  ];

  const currentPreset = presets.find((p) => p.id === selectedPreset) || presets[0];
  const [customPayloadJson, setCustomPayloadJson] = useState<string>(
    JSON.stringify(currentPreset.payload, null, 2)
  );

  const handleSelectPreset = (presetId: string) => {
    setSelectedPreset(presetId);
    const found = presets.find((p) => p.id === presetId);
    if (found) {
      setCustomPayloadJson(JSON.stringify(found.payload, null, 2));
    }
  };

  const handleSendWebhook = async () => {
    setIsSending(true);
    setResponseLog('');
    setLastEventId(null);

    try {
      let parsedPayload: any;
      try {
        parsedPayload = JSON.parse(customPayloadJson);
      } catch (jsonErr) {
        setResponseLog(`JSON Parsing Error: Invalid JSON in request body.\n${jsonErr}`);
        setIsSending(false);
        return;
      }

      const res = await fetch(currentPreset.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // For log-shipper testing if token configured
          Authorization: 'Bearer test-token',
        },
        body: JSON.stringify(parsedPayload),
      });

      const responseText = await res.text();
      let formattedJson = responseText;
      try {
        const json = JSON.parse(responseText);
        formattedJson = JSON.stringify(json, null, 2);
        if (json.eventId) {
          setLastEventId(json.eventId);
        }
      } catch {
        // Use raw text
      }

      setResponseLog(
        `HTTP Status: ${res.status} ${res.statusText}\nEndpoint: ${currentPreset.endpoint}\n\nResponse Body:\n${formattedJson}`
      );
    } catch (err) {
      setResponseLog(`Network Request Failed:\n${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsSending(false);
    }
  };

  const matchedEvent = lastEventId ? events.find((e) => e.id === lastEventId) : null;

  return (
    <div className="space-y-6">
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
        <h2 className="text-base font-bold text-white">Live Webhook & Incident Test Simulator</h2>
        <p className="text-xs text-slate-400 mt-0.5">
          Emit real HTTP requests to your server endpoints to test path normalization, deduplication, gatekeeper blocking, and Gemini diagnosis.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Preset Selector & Controls */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Test Scenario Presets</h3>

          <div className="space-y-2">
            {presets.map((preset) => {
              const isSelected = selectedPreset === preset.id;
              return (
                <button
                  key={preset.id}
                  onClick={() => handleSelectPreset(preset.id)}
                  className={`w-full text-left p-3 rounded-lg border text-xs transition-colors cursor-pointer ${
                    isSelected
                      ? 'bg-indigo-950/60 border-indigo-500/60 text-indigo-200'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                  }`}
                >
                  <div className="font-semibold text-white">{preset.name}</div>
                  <div className="font-mono text-[10px] text-slate-500 mt-0.5">{preset.endpoint}</div>
                </button>
              );
            })}
          </div>

          <button
            id="send-webhook-btn"
            disabled={isSending}
            onClick={handleSendWebhook}
            className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-lg text-xs flex items-center justify-center space-x-2 shadow cursor-pointer disabled:opacity-50 transition-colors"
          >
            {isSending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            <span>Send HTTP Webhook Request</span>
          </button>
        </div>

        {/* Payload Editor & Console Response */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-slate-300">Request Body (JSON):</span>
              <span className="text-[11px] font-mono text-indigo-400">Target: {currentPreset.endpoint}</span>
            </div>
            <textarea
              rows={8}
              value={customPayloadJson}
              onChange={(e) => setCustomPayloadJson(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-xs font-mono text-slate-200 focus:outline-none focus:border-indigo-500 leading-relaxed"
            />
          </div>

          {/* Server Response Terminal */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center space-x-2">
                <Terminal className="w-4 h-4 text-emerald-400" />
                <span className="text-xs font-semibold text-slate-300">Server Response Stream</span>
              </div>

              {matchedEvent && (
                <button
                  onClick={() => onNavigateToEvent(matchedEvent)}
                  className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold inline-flex items-center space-x-1 cursor-pointer"
                >
                  <span>Inspect Event in Pipeline</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <pre className="p-3 bg-slate-950 border border-slate-800 rounded-lg font-mono text-[11px] text-slate-300 min-h-[140px] max-h-64 overflow-y-auto whitespace-pre-wrap leading-relaxed">
              {responseLog || 'Waiting for HTTP webhook execution... Click "Send HTTP Webhook Request" above.'}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
};
