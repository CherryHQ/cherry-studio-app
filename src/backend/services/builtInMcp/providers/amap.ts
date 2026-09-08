import * as z from 'zod';

import { createHttpClient, type HttpQuery } from '@/backend/services/http';
import { PluginError } from '@/shared/contracts/plugins';

import { definePluginTool } from '../toolDefinition';

const coordinate = z
  .string()
  .regex(/^-?\d+(?:\.\d+)?,-?\d+(?:\.\d+)?$/)
  .refine((value) => {
    const [longitude, latitude] = value.split(',').map(Number);
    return Math.abs(longitude) <= 180 && Math.abs(latitude) <= 90;
  })
  .describe('GCJ-02 longitude,latitude. Do not pass WGS-84/GPS coordinates without conversion.');
const text = z.string().min(1).max(200);
const pagination = {
  page: z.int().min(1).max(100).default(1),
  offset: z.int().min(1).max(20).default(10),
};
const envelope = z.object({ status: z.string(), infocode: z.string() }).passthrough();

export function createAmapClient(getCredential: () => Promise<string>) {
  const http = createHttpClient({
    baseUrl: 'https://restapi.amap.com',
    interceptors: [
      {
        onRequest: async (request) => ({
          ...request,
          query: { ...request.query, key: await getCredential(), output: 'JSON' },
        }),
      },
    ],
  });
  async function request(path: string, query: HttpQuery, signal?: AbortSignal) {
    let data: z.infer<typeof envelope>;
    try {
      const response = await http.request<string>({
        method: 'GET',
        path,
        query,
        signal,
        responseType: 'text',
        maxResponseBytes: 256 * 1024,
      });
      data = envelope.parse(JSON.parse(response.data));
    } catch {
      throw new PluginError(
        signal?.aborted ? 'cancelled' : 'network',
        signal?.aborted
          ? 'Amap request cancelled.'
          : 'Amap request failed or returned an unsupported response.',
      );
    }
    if (data.status !== '1') {
      if (
        ['10001', '10003', '10004', '10005', '10006', '10007', '10009', '10012', '10013'].includes(
          data.infocode,
        )
      )
        throw new PluginError(
          'authorization',
          'Amap rejected this key. Check that it is an enabled Web Service key and its access restrictions allow this device.',
        );
      if (['10002', '10010', '10014', '10019', '10020', '10021'].includes(data.infocode))
        throw new PluginError('quota', 'Amap quota or rate limit reached. Try again later.');
      throw new PluginError(
        'request',
        'Amap could not complete the request. Check its parameters and enabled API services.',
      );
    }
    // Do not forward upstream diagnostics or any credential fields.
    const { status: _status, infocode: _infocode, info: _info, key: _key, ...result } = data;
    return result;
  }
  return {
    validateCredential: async (signal?: AbortSignal) => {
      const result = await request(
        '/v3/config/district',
        { keywords: '中国', subdistrict: 0 },
        signal,
      );
      z.object({ districts: z.array(z.object({ adcode: z.string() })).min(1) }).parse(result);
    },
    tools: [
      definePluginTool(
        'search_places',
        'Search places in China by keyword and optional city. Coordinates use GCJ-02. Results are paginated.',
        z.strictObject({ keywords: text, city: text.optional(), ...pagination }),
        (input, signal) => request('/v3/place/text', { ...input, extensions: 'base' }, signal),
      ),
      definePluginTool(
        'search_nearby',
        'Find places around a GCJ-02 coordinate. Radius is in meters.',
        z.strictObject({
          location: coordinate,
          keywords: text,
          radius: z.int().min(1).max(50000).default(3000),
          ...pagination,
        }),
        (input, signal) => request('/v3/place/around', { ...input, extensions: 'base' }, signal),
      ),
      definePluginTool(
        'geocode',
        'Convert a Chinese street address to GCJ-02 coordinates.',
        z.strictObject({ address: text, city: text.optional() }),
        (input, signal) => request('/v3/geocode/geo', input, signal),
      ),
      definePluginTool(
        'reverse_geocode',
        'Find the address of a GCJ-02 coordinate.',
        z.strictObject({ location: coordinate }),
        (input, signal) => request('/v3/geocode/regeo', { ...input, extensions: 'base' }, signal),
      ),
      definePluginTool(
        'driving_route',
        'Plan a driving route between GCJ-02 coordinates in China. Distances are meters, durations are seconds.',
        z.strictObject({ origin: coordinate, destination: coordinate }),
        (input, signal) =>
          request('/v3/direction/driving', { ...input, extensions: 'base', strategy: 0 }, signal),
      ),
      definePluginTool(
        'walking_route',
        'Plan a walking route between GCJ-02 coordinates in China.',
        z.strictObject({ origin: coordinate, destination: coordinate }),
        (input, signal) => request('/v3/direction/walking', input, signal),
      ),
      definePluginTool(
        'transit_route',
        'Plan a public transit route between GCJ-02 coordinates. City is the departure city, cityd is the destination city for cross-city travel.',
        z.strictObject({
          origin: coordinate,
          destination: coordinate,
          city: text,
          cityd: text.optional(),
        }),
        (input, signal) =>
          request('/v3/direction/transit/integrated', { ...input, extensions: 'base' }, signal),
      ),
      definePluginTool(
        'weather',
        'Get current weather or forecast for a Chinese city adcode. Resolve the adcode with geocode or search_district first.',
        z.strictObject({
          city: z.string().regex(/^\d{6}$/),
          extensions: z.enum(['base', 'all']).default('base'),
        }),
        (input, signal) => request('/v3/weather/weatherInfo', input, signal),
      ),
      definePluginTool(
        'search_district',
        'Look up Chinese administrative districts and city adcodes.',
        z.strictObject({ keywords: text, subdistrict: z.int().min(0).max(1).default(0) }),
        (input, signal) => request('/v3/config/district', input, signal),
      ),
    ],
  };
}
