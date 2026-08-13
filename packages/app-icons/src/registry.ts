import type { SymbolViewProps } from 'expo-symbols';
import type { SFSymbol } from 'sf-symbols-typescript';

type PlatformSymbolName = Extract<SymbolViewProps['name'], object>;

/** Union of every glyph name in the Material Symbols codepoint map expo-symbols ships. */
export type MaterialSymbolName = NonNullable<PlatformSymbolName['android']>;

export type IconRegistryEntry = {
  /** SF Symbol rendered on iOS via expo-symbols `SymbolView`. Must exist in SF Symbols 5 (iOS 17). */
  sf: SFSymbol;
  /** Material Symbols glyph rendered on Android from the bundled subset font. */
  material: MaterialSymbolName;
};

/**
 * Single source of truth mapping every icon the app uses to its SF Symbol and Material Symbols
 * glyph. Keys keep the lucide-era export names verbatim so call sites only change import paths.
 *
 * `pnpm generate:icons` regenerates `src/generated/`, the barrel, the Android subset font, and the
 * tab-bar PNGs from this table — edit here, never in the generated files. Both name columns are
 * compile-time checked (`SFSymbol` / `MaterialSymbolName`), and the generator re-validates the
 * material column against expo-symbols' codepoint map before emitting anything.
 *
 * Where a name reads oddly against the glyph it now renders, the entry is mapped to what its call
 * site means rather than to the literal lucide shape — `SquareIcon` is the composer's stop button,
 * so it draws each platform's media-stop control.
 */
export const iconRegistry = {
  ALargeSmallIcon: { sf: 'textformat.size', material: 'format_size' },
  ActivityIcon: { sf: 'waveform.path.ecg', material: 'monitoring' },
  ArrowDownIcon: { sf: 'arrow.down', material: 'arrow_downward' },
  ArrowUpDownIcon: { sf: 'arrow.up.arrow.down', material: 'swap_vert' },
  ArrowUpIcon: { sf: 'arrow.up', material: 'arrow_upward' },
  AudioLinesIcon: { sf: 'waveform', material: 'graphic_eq' },
  BellIcon: { sf: 'bell', material: 'notifications' },
  BellRingIcon: { sf: 'bell.and.waves.left.and.right', material: 'notifications_active' },
  BotIcon: { sf: 'brain.head.profile', material: 'smart_toy' },
  BoxesIcon: { sf: 'square.stack.3d.up', material: 'deployed_code' },
  BracesIcon: { sf: 'curlybraces', material: 'data_object' },
  CalendarIcon: { sf: 'calendar', material: 'calendar_today' },
  CameraIcon: { sf: 'camera', material: 'photo_camera' },
  CheckIcon: { sf: 'checkmark', material: 'check' },
  ChevronDownIcon: { sf: 'chevron.down', material: 'keyboard_arrow_down' },
  ChevronLeftIcon: { sf: 'chevron.left', material: 'chevron_left' },
  ChevronRightIcon: { sf: 'chevron.right', material: 'chevron_right' },
  ChevronUpIcon: { sf: 'chevron.up', material: 'keyboard_arrow_up' },
  CircleAlertIcon: { sf: 'exclamationmark.circle', material: 'error' },
  CircleArrowDownIcon: { sf: 'arrow.down.circle', material: 'arrow_circle_down' },
  CircleArrowUpIcon: { sf: 'arrow.up.circle', material: 'arrow_circle_up' },
  CircleDollarSignIcon: { sf: 'dollarsign.circle', material: 'paid' },
  CircleHalfIcon: { sf: 'circle.lefthalf.filled', material: 'contrast' },
  CircleUserRoundIcon: { sf: 'person.crop.circle', material: 'account_circle' },
  CloudIcon: { sf: 'cloud', material: 'cloud' },
  Code2Icon: { sf: 'chevron.left.forwardslash.chevron.right', material: 'code' },
  CodeIcon: { sf: 'chevron.left.forwardslash.chevron.right', material: 'code' },
  CopyIcon: { sf: 'doc.on.doc', material: 'content_copy' },
  CopyrightIcon: { sf: 'c.circle', material: 'copyright' },
  DatabaseIcon: { sf: 'cylinder.split.1x2', material: 'database' },
  DownloadIcon: { sf: 'arrow.down.to.line', material: 'download' },
  EarthIcon: { sf: 'globe.americas', material: 'globe' },
  EllipsisIcon: { sf: 'ellipsis', material: 'more_horiz' },
  ExternalLinkIcon: { sf: 'arrow.up.right.square', material: 'open_in_new' },
  EyeIcon: { sf: 'eye', material: 'visibility' },
  EyeOffIcon: { sf: 'eye.slash', material: 'visibility_off' },
  FileIcon: { sf: 'doc', material: 'draft' },
  FileTextIcon: { sf: 'doc.text', material: 'description' },
  FolderOpenIcon: { sf: 'folder', material: 'folder_open' },
  GiftIcon: { sf: 'gift', material: 'redeem' },
  GlobeIcon: { sf: 'globe', material: 'public' },
  HeartPulseIcon: { sf: 'heart', material: 'monitor_heart' },
  ImageIcon: { sf: 'photo', material: 'image' },
  ImageUpIcon: { sf: 'photo.badge.plus', material: 'add_photo_alternate' },
  ImagesIcon: { sf: 'photo.on.rectangle', material: 'photo_library' },
  InfoIcon: { sf: 'info.circle', material: 'info' },
  KeyRoundIcon: { sf: 'key', material: 'key' },
  LanguagesIcon: { sf: 'character.bubble', material: 'translate' },
  LightbulbIcon: { sf: 'lightbulb', material: 'lightbulb' },
  ListChecksIcon: { sf: 'checklist', material: 'checklist' },
  LockIcon: { sf: 'lock', material: 'lock' },
  MailIcon: { sf: 'envelope', material: 'mail' },
  MapPinIcon: { sf: 'mappin', material: 'location_on' },
  MessageCircleIcon: { sf: 'message', material: 'chat_bubble' },
  MicIcon: { sf: 'mic', material: 'mic' },
  MinusIcon: { sf: 'minus', material: 'remove' },
  MonitorCloudIcon: { sf: 'externaldrive.badge.icloud', material: 'backup' },
  NetworkIcon: { sf: 'network', material: 'network_node' },
  PaletteIcon: { sf: 'paintpalette', material: 'palette' },
  PauseIcon: { sf: 'pause', material: 'pause' },
  PencilIcon: { sf: 'pencil', material: 'edit' },
  PersonCropSquareOnSquareAngledIcon: {
    sf: 'person.crop.square.on.square.angled',
    material: 'recent_actors',
  },
  PlayIcon: { sf: 'play', material: 'play_arrow' },
  PlusIcon: { sf: 'plus', material: 'add' },
  ProportionsIcon: { sf: 'aspectratio', material: 'aspect_ratio' },
  ReceiptTextIcon: { sf: 'list.bullet.rectangle.portrait', material: 'receipt_long' },
  RefreshCcwIcon: { sf: 'arrow.counterclockwise', material: 'sync' },
  RefreshCwIcon: { sf: 'arrow.clockwise', material: 'refresh' },
  RotateCcwIcon: { sf: 'arrow.counterclockwise', material: 'replay' },
  RotateCwIcon: { sf: 'arrow.clockwise', material: 'rotate_right' },
  RssIcon: { sf: 'dot.radiowaves.up.forward', material: 'rss_feed' },
  SaveIcon: { sf: 'square.and.arrow.down', material: 'save' },
  SearchIcon: { sf: 'magnifyingglass', material: 'search' },
  Settings2Icon: { sf: 'slider.horizontal.3', material: 'tune' },
  SettingsIcon: { sf: 'gearshape', material: 'settings' },
  ShieldCheckIcon: { sf: 'checkmark.shield', material: 'verified_user' },
  SlidersHorizontalIcon: { sf: 'slider.horizontal.3', material: 'tune' },
  SparklesIcon: { sf: 'sparkles', material: 'auto_awesome' },
  SpeechIcon: { sf: 'speaker.wave.2.bubble.left', material: 'text_to_speech' },
  SquareArrowOutUpRightIcon: { sf: 'arrow.up.right.square', material: 'open_in_new' },
  SquareIcon: { sf: 'stop.fill', material: 'stop' },
  SquarePenIcon: { sf: 'square.and.pencil', material: 'edit_square' },
  SunIcon: { sf: 'sun.max', material: 'light_mode' },
  Trash2Icon: { sf: 'trash', material: 'delete' },
  TypeIcon: { sf: 'textformat', material: 'text_fields' },
  UploadIcon: { sf: 'square.and.arrow.up', material: 'upload' },
  VideoIcon: { sf: 'video', material: 'videocam' },
  WrenchIcon: { sf: 'wrench.adjustable', material: 'build' },
  XIcon: { sf: 'xmark', material: 'close' },
} as const satisfies Record<string, IconRegistryEntry>;

export type IconExportName = keyof typeof iconRegistry;

/**
 * Android bottom-tab drawables baked as PNGs by the generator (the native tab bar takes image
 * sources, not React components). iOS tabs pass SF Symbol names straight to the navigator, so
 * their names live in `src/app/(tabs)/_layout.tsx` instead.
 */
export const tabBarIcons = {
  assistants: 'group',
  home: 'home',
  messages: 'chat',
  search: 'search',
  settings: 'settings',
} as const satisfies Record<string, MaterialSymbolName>;
