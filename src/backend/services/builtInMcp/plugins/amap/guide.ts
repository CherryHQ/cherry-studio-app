import type { PluginGuideDefinition } from '../../pluginGuide';

export const amapGuide = {
  revision: 1,
  sections: [
    {
      requiredTools: [],
      content: `# Amap / 高德地图

Use this connection for place lookup, nearby search, routes and weather within its available tools.
Coordinates must be GCJ-02 in longitude,latitude order. Do not silently pass coordinates from another
coordinate system or assume a GPS value is already GCJ-02. Use returned locations when possible.
Resolve materially ambiguous cities or same-name places before recommending a route. Do not assume
access to the user's current location; obtain it from the user or an independently available location tool.`,
    },
    {
      requiredTools: ['maps_text_search'],
      content: `## Find a place

Discover \`amap maps_text_search\` for a venue, landmark or point of interest. Narrow the query by city
when known. Use the returned name, address and location together to choose the intended result, rather
than taking the first same-name match without context.`,
    },
    {
      requiredTools: ['maps_geo'],
      content: `## Resolve an address

Discover \`amap maps_geo\` for a street address. Supply the city when known and retain the returned
coordinates for subsequent location-based calls. Do not invent coordinates from an address.`,
    },
    {
      requiredTools: ['maps_regeocode'],
      content: `## Identify a location

Discover \`amap maps_regeocode\` when the user supplies compatible coordinates and needs the address
or area. Preserve coordinate order and do not claim a more precise location than the result supports.`,
    },
    {
      requiredTools: ['maps_around_search'],
      content: `## Search nearby

Discover \`amap maps_around_search\`. Establish a real search center and the requested radius or category
before calling. If the center is only a place name, resolve it with an available lookup first. Summarize
the returned candidates and distinguish straight-line proximity from travel distance.`,
    },
    {
      requiredTools: ['maps_direction_driving'],
      content: `## Driving directions

Discover \`amap maps_direction_driving\`. Resolve both endpoints before requesting the route, using
available place lookup tools when needed. Compare only returned alternatives; describe duration and
distance as estimates, and do not invent parking, toll or traffic details absent from the response.`,
    },
    {
      requiredTools: ['maps_direction_walking'],
      content: `## Walking directions

Discover \`amap maps_direction_walking\` after establishing both endpoint coordinates. Summarize the
returned distance, estimated duration and useful route steps; a driving result is not a walking route.`,
    },
    {
      requiredTools: ['maps_direction_transit_integrated'],
      content: `## Public transport

Discover \`amap maps_direction_transit_integrated\`. Establish endpoint coordinates and the cities
required by its current schema. Compare returned transfers, walking segments and estimated durations.
Do not present a route estimate as a guaranteed departure time or real-time service status.`,
    },
    {
      requiredTools: ['maps_weather'],
      content: `## Weather

Discover \`amap maps_weather\` and use the requested city in the format its current schema accepts.
Keep the returned location, observation or forecast dates and units visible. Do not label a forecast as
current conditions or extend it beyond the dates actually returned.`,
    },
  ],
} satisfies PluginGuideDefinition;
