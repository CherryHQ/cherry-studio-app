import { DataApiError, DataApiErrorFactory, ErrorCode } from '@/shared/data/api/errors';

import { getMcpServerSaveErrorKey, resolveMcpServerName } from '../mcpServerForm';

const info = { name: 'remote-name', title: 'Remote title', version: '1' };

describe('MCP local connection names', () => {
  test('preserves a local alias even when the server advertises another name', () => {
    expect(resolveMcpServerName(' Work ', info, 'example.com')).toBe('Work');
  });

  test('uses discovery metadata only when no local alias was supplied', () => {
    expect(resolveMcpServerName(' ', info, 'example.com')).toBe('Remote title');
    expect(resolveMcpServerName('', { ...info, title: ' ' }, 'example.com')).toBe('remote-name');
    expect(resolveMcpServerName('', { name: ' ', version: '1' }, 'example.com')).toBe(
      'example.com',
    );
  });
});

describe('MCP save conflict guidance', () => {
  test('distinguishes a duplicate local name from a stale connection edit', () => {
    expect(
      getMcpServerSaveErrorKey(
        new DataApiError(ErrorCode.CONFLICT, 'private diagnostic', {
          resource: 'McpServer',
          field: 'name',
        }),
      ),
    ).toBe('settings.mcp.toast.nameConflict');
    expect(getMcpServerSaveErrorKey(DataApiErrorFactory.conflict('The connection changed'))).toBe(
      'settings.mcp.toast.saveConflict',
    );
  });

  test('does not infer a name conflict from diagnostic text or another resource', () => {
    expect(getMcpServerSaveErrorKey(new Error('MCP server name already exists'))).toBe(
      'settings.mcp.toast.saveFailed',
    );
    expect(
      getMcpServerSaveErrorKey(
        new DataApiError(ErrorCode.CONFLICT, 'private diagnostic', {
          resource: 'Other',
          field: 'name',
        }),
      ),
    ).toBe('settings.mcp.toast.saveConflict');
  });
});
