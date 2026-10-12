import { getDiagnosticReportStatus } from '../diagnosticReportStatus';

const mockRequest = jest.fn();
jest.mock('@/backend/services/http', () => ({
  createHttpClient: () => ({ request: (...args: unknown[]) => mockRequest(...args) }),
}));
const id = '550e8400-e29b-41d4-a716-446655440000';
const body = {
  id,
  status: 'pending',
  created_at: '2026-10-12T00:00:00Z',
  updated_at: '2026-10-12T00:00:00Z',
};

beforeEach(() => {
  mockRequest.mockReset();
  mockRequest.mockResolvedValue({ status: 200, data: body });
});

test.each(['pending', 'unprocessed', 'investigating', 'resolved', 'closed'])(
  'accepts the documented %s status and forwards a bounded, cancellable request',
  async (status) => {
    const signal = new AbortController().signal;
    mockRequest.mockResolvedValue({ status: 200, data: { ...body, status } });
    await expect(getDiagnosticReportStatus(id, signal)).resolves.toEqual({
      status: 'found',
      reportId: id,
      processingStatus: status,
      createdAt: body.created_at,
      updatedAt: body.updated_at,
    });
    expect(mockRequest).toHaveBeenCalledWith({
      method: 'GET',
      path: `/diagnostics/${id}/status`,
      logPath: '/diagnostics/[report-id]/status',
      maxResponseBytes: 65536,
      redirect: 'error',
      signal,
    });
  },
);

test.each([
  [404, { status: 'not_found' }],
  [429, { status: 'failed', reason: 'rate_limited' }],
  [502, { status: 'failed', reason: 'unavailable' }],
  [201, { status: 'failed', reason: 'unavailable' }],
])('maps HTTP %s without fabricating a processing status', async (status, expected) => {
  mockRequest.mockResolvedValue({ status, data: body });
  await expect(getDiagnosticReportStatus(id)).resolves.toEqual(expected);
});

test.each([
  { ...body, id: '650e8400-e29b-41d4-a716-446655440000' },
  { ...body, status: 'uploaded' },
  { ...body, updated_at: 'invalid' },
  null,
])('rejects a malformed or mismatched acknowledgement', async (data) => {
  mockRequest.mockResolvedValue({ status: 200, data });
  await expect(getDiagnosticReportStatus(id)).resolves.toEqual({
    status: 'failed',
    reason: 'unavailable',
  });
});

test('a transport failure stays unavailable while cancellation propagates', async () => {
  mockRequest.mockRejectedValue(new Error('offline'));
  await expect(getDiagnosticReportStatus(id)).resolves.toEqual({
    status: 'failed',
    reason: 'unavailable',
  });
  const controller = new AbortController();
  mockRequest.mockImplementationOnce(() => {
    controller.abort();
    return Promise.reject(new Error('cancelled'));
  });
  await expect(getDiagnosticReportStatus(id, controller.signal)).rejects.toBe(
    controller.signal.reason,
  );
});

test('invalid IDs and pre-aborted reads do not make requests', async () => {
  await expect(getDiagnosticReportStatus('../other')).resolves.toEqual({ status: 'not_found' });
  const controller = new AbortController();
  controller.abort();
  await expect(getDiagnosticReportStatus(id, controller.signal)).rejects.toBe(
    controller.signal.reason,
  );
  expect(mockRequest).not.toHaveBeenCalled();
});
