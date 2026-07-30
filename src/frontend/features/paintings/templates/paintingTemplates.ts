import type { ImageProps } from 'expo-image';

import type { PaintingDraftHandoff } from '../utils/paintingDraftHandoff';

export type PaintingTemplate = Readonly<{
  author?: string;
  id: string;
  preview: ImageProps['source'];
  prompt: string;
  title: string;
}>;

export const paintingTemplates: readonly PaintingTemplate[] = [
  {
    author: '@0x00_Krypt',
    id: 'china-landmark-diorama',
    preview: require('../../../../../assets/paintings/templates/china-landmark-diorama.webp'),
    prompt: `A highly realistic miniature city diorama emerging vertically from a flat, detailed street map of [CITY], vertical composition.

[CORE CONCEPT]
A large printed urban street map lies flat on a tabletop, serving as the physical foundation of the entire scene. Directly from the map surface, a compact three-dimensional miniature version of [CITY] appears to grow upward, transforming the flat cartographic landscape into a realistic architectural city model.

[CITY LANDMARKS]
The miniature city cluster prominently features [LANDMARK 1], [LANDMARK 2], and [LANDMARK 3]. Each landmark is carefully recreated as a highly detailed, realistic scale model, preserving its recognizable architectural silhouette, structural characteristics, facade materials, and local identity.

[VERTICAL GROWTH EFFECT]
All buildings, roads, trees, infrastructure, and urban elements emerge directly from their corresponding positions on the flat map, as if the two-dimensional map is physically transforming into a three-dimensional city. The transition between printed map and miniature city is seamless and visually convincing.

[URBAN COMPOSITION]
The landmarks form a dense but carefully balanced miniature urban cluster. Major buildings rise vertically at different heights, creating a strong city skyline and clear visual hierarchy. Smaller architecture, streets, public spaces, and vegetation naturally fill the gaps between major landmarks.

[NATURAL ELEMENTS]
Include miniature [NATURAL ELEMENTS], such as dense urban trees, landscaped greenery, small parks, riverside vegetation, hills, lakes, or region-specific natural features. The vegetation is lush, realistic, and finely detailed, integrated naturally into the miniature city environment.

[CITY LIFE]
Populate the scene with tiny realistic urban life details: [CITY LIFE ELEMENTS], miniature pedestrians walking along sidewalks, people waiting near transit stops, small groups gathering in public spaces, subtle street activity, and everyday city movement.

[ICONIC TRANSPORTATION]
Include recognizable [ICONIC TRANSPORTATION] moving through the miniature streets, accurately reflecting the transportation identity of [CITY]. Vehicles are rendered as detailed scale models and naturally integrated into the road network.

[EXTRA DETAILS]
Add [EXTRA DETAILS], including miniature street signs, traffic lights, road markings, lamp posts, storefronts, transit stations, barriers, benches, utility structures, and subtle local cultural details. Every element should reinforce the specific visual identity of [CITY].

[MAP FOUNDATION]
The surrounding flat map remains clearly visible around the miniature city cluster, showing colorful road networks, district blocks, waterways, parks, route lines, and subtle cartographic markings. The map gradually falls out of focus toward the background.

[PHOTOGRAPHY]
Professional studio macro photography of a premium architectural scale model, photographed from a slightly elevated three-quarter perspective. Soft diffused studio lighting, gentle natural shadows, cinematic shallow depth of field, selective focus, realistic miniature photography, tilt-shift visual character.

[VISUAL STYLE]
Photorealistic miniature city diorama, premium urban planning model, museum-quality architectural maquette, extremely detailed craftsmanship, realistic materials, precise scale-model textures, charming tiny-world atmosphere, clean composition, cinematic realism.

[COMPOSITION]
The miniature city occupies the central and middle area of the frame, rising dramatically from the flat map. The tallest landmark creates the primary vertical focal point, while secondary landmarks form a layered skyline around it. Generous softly blurred negative space appears in the upper background.

vertical 3:4 aspect ratio, macro lens, shallow depth of field, ultra-detailed, photorealistic, cinematic miniature photography, 8K`,
    title: 'China Landmark Diorama',
  },
  {
    author: '@wory37303852',
    id: 'meta-quest-3-exploded-view',
    preview: require('../../../../../assets/paintings/templates/meta-quest-3-exploded-view.webp'),
    prompt: `Create a clean high-tech exploded-view product diagram poster for a [PRODUCT TYPE], vertical composition.

[CONFIGURATION]
Product type: [PRODUCT TYPE] (default: VR headset)
Product name: [PRODUCT NAME] (default: Meta Quest 3)
Background color: [BACKGROUND COLOR] (default: soft purple and blue gradient)
Main catchphrase: [MAIN CATCHPHRASE] (default: まったく新しい現実を、まったく新しい構造から。)
Bottom headline: [BOTTOM HEADLINE] (default: 体験は、構造から進化する。)

[CORE CONCEPT]
Design a premium technical product poster centered on a vertically stacked exploded view of [PRODUCT NAME]. Present the device as a precise, carefully engineered assembly whose internal structure is easy to understand at a glance.

[EXPLODED STRUCTURE]
Separate the [PRODUCT TYPE] into nine distinct floating layers, aligned vertically along one central axis: the outer shell, camera sensors, motherboard with processor chip, pancake lenses, internal frame, battery packs, side straps, top strap, and facial interface cushion. Maintain realistic spacing, scale, attachment logic, and mechanical relationships between every layer.

[COMPONENT DETAIL]
Render every component as a high-detail 3D product model with accurate materials, connectors, screws, circuit traces, optical glass, molded plastic, fabric, cushioning, and internal mounting structures. Use restrained glowing accents to clarify important technology without overwhelming the product.

[CALLOUT LABELS]
Place eight fine technical callout labels around the exploded assembly, connected with thin precise leader lines. Keep the labels balanced across both sides and typeset them in clean Japanese sans-serif text.

Left side labels:
- "Snapdragon® XR2 Gen 2
圧倒的な処理性能でリアルタイムな体験を。"
- "調整可能なIPD機構
幅広いユーザーに快適なフィット感を。"
- "精密設計されたヘッドストラップ
快適さと安定性を追求したエルゴノミクス。"

Right side labels:
- "フェイスプレート
洗練されたデザインと最適な重量バランス。"
- "トラッキングカメラ
高精度な位置トラッキングと環境認識を実現。"
- "パンケーキレンズ
薄型設計で広い視野角と鮮明な映像を提供。"
- "高性能バッテリー
長時間駆動を支える最適化された電源設計。"
- "柔らかなフェイスインターフェース
長時間でも快適な装着感を実現。"

[HEADER]
At the upper left, place an infinity-style brand mark followed by [PRODUCT NAME]. Beneath it, display [MAIN CATCHPHRASE] as a compact Japanese subtitle. Keep the header spacious, refined, and aligned to a premium technology campaign.

[FOOTER]
At the lower left, display [BOTTOM HEADLINE] in bold Japanese typography. Beneath it, add this body copy: "一つひとつのパーツに、没入体験を支える最先端テクノロジーとこだわりの設計。Meta Quest 3は、未来を感じさせる体験を内部から生み出しています。" At the lower right, place an infinity-style Meta logo.

[BACKGROUND]
Use [BACKGROUND COLOR] as a clean luminous studio backdrop with subtle depth, soft atmospheric falloff, and enough negative space for the labels. Avoid environmental scenery or decorative clutter.

[LIGHTING]
High-end studio product lighting, soft frontal illumination, controlled rim lights, realistic reflections, gentle contact shadows, subtle glow around optical and electronic components, and crisp material separation.

[VISUAL STYLE]
Clean high-tech 3D render, premium industrial design visualization, precise exploded product diagram, polished global advertising campaign, accurate engineering detail, elegant typography, and restrained futuristic accents.

[COMPOSITION]
The complete exploded assembly occupies the central vertical axis. The outer shell begins near the top and the facial interface cushion finishes near the bottom, with all nine layers clearly separated and fully visible. Balance the callouts symmetrically while preserving a strong visual hierarchy from header to product to footer.

vertical 3:4 aspect ratio, ultra-detailed product visualization, studio lighting, sharp technical typography, premium advertising poster`,
    title: 'Meta Quest 3 Exploded View',
  },
  {
    author: '@rovvmut_',
    id: 'crocs-editorial-poster',
    preview: require('../../../../../assets/paintings/templates/crocs-editorial-poster.webp'),
    prompt: `A high-fashion surrealist advertising poster for Crocs. The scene is set in a minimalist, monochrome light blue studio with a semi-reflective floor.

The central focus is an oversized, giant white Croc clog positioned on its heel at a diagonal angle, serving as a backrest. A fashion model with long dark hair, dressed in a clean, all-white coordinated sweatshirt and wide-leg trousers, leans her entire back against the giant shoe in a relaxed, leaning posture. She is facing right in profile, looking ahead with a serene expression, and wearing standard-sized white Crocs.

In the background, the word "CROCS" is written in massive, bold, white condensed sans-serif typography, partially occluded by the giant shoe and the model to create a sense of depth. At the top right, "Designed with ChatGPT".

At the bottom center, a white sans-serif tagline reads: "Made for comfort, worn for confidence. Because life feels better when your feet stop complaining." The lighting is soft, cool, and even, casting gentle shadows and a soft reflection of the subjects on the glossy blue floor. The overall aesthetic is clean, modern, and high-concept.

Make the aspect ratio 3:4.`,
    title: 'Crocs Editorial Poster',
  },
  {
    author: '@iamaiistudio',
    id: 'algorithm-fog-city-poster',
    preview: require('../../../../../assets/paintings/templates/algorithm-fog-city-poster.webp'),
    prompt:
      'Create an international-quality cinematic movie poster for a film titled "Algorithm Fog City." Make it look like a masterfully designed festival-grade sci-fi thriller poster: a fog-drowned megacity, a lone figure in the lower foreground, a giant translucent human profile merged with glowing data streams and prediction-interface graphics, cold blue-gray atmosphere with subtle amber UI accents, dramatic vertical typography for the title, premium theatrical composition, realistic lighting, dense atmospheric depth, and polished high-end film poster design.',
    title: 'Algorithm: Fog City',
  },
  {
    author: '@aimikoda',
    id: 'cyber-rabbit-character',
    preview: require('../../../../../assets/paintings/templates/cyber-rabbit-character.webp'),
    prompt: `Create a full-body character concept illustration of a [CHARACTER TYPE], vertical composition.

[CONFIGURATION]
Character type: [CHARACTER TYPE] (default: female rabbit mechanoid)
Aspect ratio: [ASPECT RATIO] (default: 2:3)

[CORE CONCEPT]
Design a tall, athletic rabbit mechanoid standing in a confident frontal pose. The figure combines a sleek black biomechanical torso, a narrow waist, long robotic legs, large upright rabbit ears, cream-white armor plates, and vivid red markings.

[HEAD AND EARS]
The head is a smooth pale rabbit-like mask with small slanted orange eyes and a red bow-like symbol on the forehead. Two oversized mechanical rabbit ears rise straight upward and remain fully visible within the frame.

[COLOR PALETTE]
Use matte black for the exposed mechanical structure, cream-white for the armor plates, and vivid red for symbols, circular spots, glyphs, and accent panels. Keep the palette graphic, controlled, and high contrast.

[ARMOR ZONES]
The armor has exactly three main cream-white spotted zones: both forearms covered in red circular spots, both lower shin guards covered in red spots, and large rounded hip and thigh armor panels with black socket-like holes and a bold red number-like marking on one side.

[MECHANICAL DETAILING]
Include exposed joints, pistons, screws, circular ports, cables, layered plating, and asymmetrical mechanical detailing throughout the body. The feet are rabbit-like mechanical paws with clearly articulated clawed toes.

[WEAPON]
The character holds one oversized futuristic rifle vertically downward in both hands, centered between the legs. Build the rifle from black metal with vivid red accent glyphs and panels, intricate mechanical components, and a heavy industrial silhouette.

[POSE AND FRAMING]
Show the character in a stable, confident frontal stance with the full body visible from the tips of the ears to the feet. Keep every limb and the complete weapon inside the frame, with clean negative space around the silhouette.

[BACKGROUND]
Use a plain warm off-white studio background with minimal grounding shadow. Include no environment, scenery, props, text, or logo.

[VISUAL STYLE]
High-detail anime mecha concept art, sharp inked edges, subtle cel shading, precise industrial construction, clean negative space, polished character-sheet presentation, and crisp material separation.

[CONSTRAINTS]
No text, no logo, no environment, no cropped ears, no cropped limbs, no duplicate weapon, and no extra characters. Full body visible from ears to feet.

vertical [ASPECT RATIO] composition, full-body character concept art, ultra-detailed anime mecha design, clean studio presentation`,
    title: 'Cyber Rabbit Character',
  },
];

export function toPaintingTemplateDraft(template: PaintingTemplate): PaintingDraftHandoff {
  return {
    attachments: [],
    draft: template.prompt,
  };
}
