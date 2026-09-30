import type { PluginGuideDefinition } from '../../pluginGuide';

export const amapGuide = {
  revision: 3,
  sections: [
    {
      requiredTools: [],
      content: `# Amap / 高德地图

Search Amap tools for places, nearby search, routes or weather. Coordinates use GCJ-02 longitude,latitude;
GPS coordinates are not necessarily compatible. Obtain the user's location from the user or an available
location tool. Resolve named endpoints with available place/address lookup before routing, checking city
and address for same-name places. Match the requested travel mode and treat route durations as estimates.`,
    },
    {
      requiredTools: ['maps_around_search'],
      content: `## Search nearby

Resolve the search center before \`amap maps_around_search\`. Straight-line proximity does not establish
travel distance.`,
    },
    {
      requiredTools: ['maps_search_detail'],
      content: `## Inspect a place

Use \`amap maps_search_detail\` with a verified POI ID from place search to inspect the actual location
and address. A same-name search result alone does not identify the destination.`,
    },
    {
      requiredTools: ['maps_ip_location'],
      content: `## IP location

\`amap maps_ip_location\` estimates an IP address's area; it does not establish the user's precise
location or a route origin. Ask for an address or coordinates when a precise origin is needed.`,
    },
    {
      requiredTools: ['maps_bicycling', 'maps_distance'],
      content: `## Cycling and distances

Use \`amap maps_bicycling\` for bicycle routes. It does not establish electric-bike suitability.
Check \`maps_distance\`'s requested distance mode; straight-line distances are not travel distances.`,
    },
    {
      requiredTools: ['maps_direction_transit_integrated'],
      content: `## Public transport

For \`amap maps_direction_transit_integrated\`, establish endpoint cities as well as coordinates.
Compare transfers and walking segments; route estimates do not establish live departure times.`,
    },
  ],
} satisfies PluginGuideDefinition;
