import { randomUUID } from 'expo-crypto';
import { Directory, File } from 'expo-file-system';

import { BaseService, DependsOn, Injectable, Phase, ServicePhase } from '@/backend/core/lifecycle';
import type { PreferenceService } from '@/backend/data/PreferenceService';
import type { AgentEvent } from '@/shared/contracts/agent';
import { loggerService } from '@/shared/core/logger/LoggerService';

import { appendBytes, diagnosticDirectory, serializeDiagnosticRecord } from './diagnosticFiles';

@Injectable('AgentEventTraceRuntime')
@ServicePhase(Phase.PostReady)
@DependsOn(['PreferenceService'])
export class AgentEventTraceRuntime extends BaseService {
  private enabled = false;

  constructor(private readonly preference: PreferenceService) {
    super();
  }

  protected onInit(): void {
    // PC evaluates this at startup. Changing the preference requires a restart.
    this.enabled = this.preference.readCached('app.developer_mode.enabled');
  }

  protected onStop(): void {
    this.enabled = false;
  }

  record(sessionId: string, event: AgentEvent): void {
    if (!this.enabled) return;
    try {
      const startTime = Date.now();
      const segment = [...new TextEncoder().encode(sessionId)]
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join('');
      const directory = new Directory(diagnosticDirectory('traces'), segment);
      const file = new File(directory, `${new Date(startTime).toISOString().slice(0, 10)}.jsonl`);
      const traceId = sessionId.replace(/-/g, '').toLowerCase();
      // Mobile's producer is the Agent event stream. Keep PC's persisted span
      // envelope, with the complete event as an attribute, so archive readers
      // can correlate timing and session data without an Electron/OTel runtime.
      appendBytes(
        file,
        new TextEncoder().encode(
          `${serializeDiagnosticRecord({
            id: randomUUID().replace(/-/g, '').slice(0, 16),
            traceId,
            parentId: '',
            startTime,
            endTime: startTime,
            isEnd: true,
            kind: 'INTERNAL',
            status:
              (event.type === 'turn.updated' && event.turn.status === 'failed') ||
              (event.type === 'message.finalized' && event.message.status === 'error')
                ? 'ERROR'
                : 'UNSET',
            name: `mobile.agent.${event.type}`,
            topicId: sessionId,
            attributes: { 'mobile.agent.event': serializeDiagnosticRecord(event) },
            events: [],
            links: [],
          })}\n`,
        ),
      );
    } catch (error) {
      loggerService
        .withContext('AgentEventTraceRuntime')
        .warn('Failed to persist Agent trace', { error });
    }
  }
}
