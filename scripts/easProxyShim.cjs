'use strict';

const Module = require('node:module');

const SHIMMED = Symbol.for('cherry.agentBase6.nodeHttpsProxyShim');

function isSecureEndpointFixed(options) {
  if (options) {
    if (typeof options.secureEndpoint === 'boolean') {
      return options.secureEndpoint;
    }
    if (typeof options.protocol === 'string') {
      return options.protocol === 'https:';
    }
  }
  const { stack } = new Error();
  if (typeof stack !== 'string') {
    return false;
  }
  return stack
    .split('\n')
    .some((line) => line.includes('(https.js:') || line.includes('node:https:'));
}

function patchAgentBaseModule(exported) {
  const proto = exported && exported.Agent && exported.Agent.prototype;
  if (!proto || proto[SHIMMED]) {
    return exported;
  }
  const protocolDesc = Object.getOwnPropertyDescriptor(proto, 'protocol');
  if (!protocolDesc || typeof protocolDesc.get !== 'function') {
    return exported;
  }

  Object.defineProperty(proto, 'protocol', {
    configurable: true,
    get() {
      if (typeof this.explicitProtocol === 'string') {
        return this.explicitProtocol;
      }
      return isSecureEndpointFixed() ? 'https:' : 'http:';
    },
    set(value) {
      this.explicitProtocol = value;
    },
  });

  Object.defineProperty(proto, 'defaultPort', {
    configurable: true,
    get() {
      if (typeof this.explicitDefaultPort === 'number') {
        return this.explicitDefaultPort;
      }
      return isSecureEndpointFixed() ? 443 : 80;
    },
    set(value) {
      this.explicitDefaultPort = value;
    },
  });

  if (typeof proto.addRequest === 'function') {
    const originalAddRequest = proto.addRequest;
    proto.addRequest = function addRequestWithNodeHttpsCheck(req, opts) {
      const nextOpts = Object.assign({}, opts);
      if (typeof nextOpts.secureEndpoint !== 'boolean') {
        nextOpts.secureEndpoint = isSecureEndpointFixed(nextOpts);
      }
      return originalAddRequest.call(this, req, nextOpts);
    };
  }

  proto[SHIMMED] = true;
  return exported;
}

if (!Module._cherryEasProxyShimInstalled) {
  Module._cherryEasProxyShimInstalled = true;
  const originalLoad = Module._load;
  Module._load = function loadWithAgentBaseProxyShim(request, parent, isMain) {
    const exported = originalLoad.call(this, request, parent, isMain);
    if (request === 'agent-base') {
      return patchAgentBaseModule(exported);
    }
    return exported;
  };
}

module.exports = { patchAgentBaseModule };
