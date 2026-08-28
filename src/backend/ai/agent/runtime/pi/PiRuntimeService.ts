import { BaseService, Injectable, Phase, ServicePhase } from '@/backend/core/lifecycle';

import { createPiModelResolver } from '../../piAdapter/piModelResolver';
import type {
  AgentRuntime,
  AgentRuntimeSession,
  RuntimeDescriptor,
  RuntimeModel,
  RuntimeModelPreflight,
} from '../types';
import { PiRuntime } from './PiRuntime';

/**
 * The composition-root binding of the Agent Runtime contract to Pi.
 *
 * This service is the only place that names a concrete Runtime. Replacing the
 * Runtime means adding an implementation directory and re-pointing the
 * `AgentRuntime` registration; consumers depend on the `AgentRuntime` contract
 * and never construct a Runtime themselves.
 */
@Injectable('AgentRuntime')
@ServicePhase(Phase.PostReady)
export class PiRuntimeService extends BaseService implements AgentRuntime {
  private readonly runtime: AgentRuntime = new PiRuntime(createPiModelResolver());

  get descriptor(): RuntimeDescriptor {
    return this.runtime.descriptor;
  }

  preflightModel(model: RuntimeModel): Promise<RuntimeModelPreflight> {
    return this.runtime.preflightModel(model);
  }

  open(): Promise<AgentRuntimeSession> {
    return this.runtime.open();
  }
}
