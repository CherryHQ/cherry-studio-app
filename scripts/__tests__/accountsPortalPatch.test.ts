import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

// Compiled SDK PR #17 at 798c757. Remove with the patch after SDK 0.2.0 is published.
const artifacts = {
  'AccountsPortal.js': '97b6feeb1ec4a05c69f737b325c539c1d1a1b5660e97e0648dd45bbe550c0ecb',
  'AccountsPortal.d.ts': '39a60e7dfd47c8d333530ca4a46f322898be08fa4f7c6dc7d25784305525896c',
  'AccountIdentity.js': '67b81e428284aecb673640efd45d2f08bb25ce32a3a102b755ddb3a0b57c3523',
  'AccountIdentity.d.ts': 'b26d506edf7e02efaefbee087763f597a6593deed082640e6d91ddfb19190f6e',
};

test.each(Object.entries(artifacts))(
  'SDK patch preserves the reviewed %s artifact',
  (file, hash) => {
    const source = readFileSync(`node_modules/@cherryinternal/accounts-portal/dist/${file}`);
    expect(createHash('sha256').update(source).digest('hex')).toBe(hash);
  },
);
