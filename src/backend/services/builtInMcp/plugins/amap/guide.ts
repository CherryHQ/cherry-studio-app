import type { PluginGuideDefinition } from '../../pluginGuide';

export const amapGuide = {
  revision: 2,
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
      requiredTools: ['maps_direction_transit_integrated'],
      content: `## Public transport

For \`amap maps_direction_transit_integrated\`, establish endpoint cities as well as coordinates.
Compare transfers and walking segments; route estimates do not establish live departure times.`,
    },
  ],
} satisfies PluginGuideDefinition;
