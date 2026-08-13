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
  /**
   * Set when the platform glyph departs from the lucide metaphor it replaces. Feeds the
   * migration drift report so each entry can be re-judged with the UI in front of you.
   */
  drift?: string;
};

/**
 * Single source of truth mapping every icon the app uses to its SF Symbol and Material Symbols
 * glyph. Keys keep the lucide-era export names verbatim so call sites only change import paths.
 *
 * `pnpm generate:icons` regenerates `src/generated/`, the barrel, the Android subset font, and the
 * tab-bar PNGs from this table — edit here, never in the generated files. Both name columns are
 * compile-time checked (`SFSymbol` / `MaterialSymbolName`), and the generator re-validates the
 * material column against expo-symbols' codepoint map before emitting anything.
 */
export const iconRegistry = {
  ALargeSmallIcon: {
    sf: 'textformat.size',
    material: 'format_size',
    drift: 'Font-size metaphor rendered as "A" sizes on both platforms, not lucide\'s a/A pair.',
  },
  ActivityIcon: {
    sf: 'waveform.path.ecg',
    material: 'monitoring',
    drift: 'Health-check pulse: iOS keeps an ECG line, Android becomes a monitoring line chart.',
  },
  ArrowDownIcon: { sf: 'arrow.down', material: 'arrow_downward' },
  ArrowUpDownIcon: { sf: 'arrow.up.arrow.down', material: 'swap_vert' },
  ArrowUpIcon: { sf: 'arrow.up', material: 'arrow_upward' },
  AudioLinesIcon: {
    sf: 'waveform',
    material: 'graphic_eq',
    drift: "Waveform bars instead of lucide's mirrored audio lines; same audio-signal reading.",
  },
  BellIcon: { sf: 'bell', material: 'notifications' },
  BellRingIcon: { sf: 'bell.and.waves.left.and.right', material: 'notifications_active' },
  BotIcon: {
    sf: 'brain.head.profile',
    material: 'smart_toy',
    drift: 'SF Symbols has no robot; iOS shows a thinking head, Android keeps a robot toy.',
  },
  BoxesIcon: {
    sf: 'square.stack.3d.up',
    material: 'deployed_code',
    drift: 'Embedding-model stack: iOS 3D square stack, Android deployed-code cube.',
  },
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
  CircleUserRoundIcon: { sf: 'person.crop.circle', material: 'account_circle' },
  CloudIcon: { sf: 'cloud', material: 'cloud' },
  Code2Icon: {
    sf: 'chevron.left.forwardslash.chevron.right',
    material: 'code',
    drift: 'Converges with CodeIcon: both lucide variants collapse to the platform code glyph.',
  },
  CodeIcon: { sf: 'chevron.left.forwardslash.chevron.right', material: 'code' },
  CopyIcon: { sf: 'doc.on.doc', material: 'content_copy' },
  CopyrightIcon: { sf: 'c.circle', material: 'copyright' },
  DatabaseIcon: { sf: 'cylinder.split.1x2', material: 'database' },
  DownloadIcon: { sf: 'arrow.down.to.line', material: 'download' },
  EarthIcon: { sf: 'globe.americas', material: 'globe' },
  EllipsisIcon: { sf: 'ellipsis', material: 'more_horiz' },
  ExternalLinkIcon: {
    sf: 'arrow.up.right.square',
    material: 'open_in_new',
    drift:
      "Arrow leaves a square instead of lucide's broken-corner box; same open-elsewhere reading.",
  },
  EyeIcon: { sf: 'eye', material: 'visibility' },
  EyeOffIcon: { sf: 'eye.slash', material: 'visibility_off' },
  FileIcon: { sf: 'doc', material: 'draft' },
  FileTextIcon: { sf: 'doc.text', material: 'description' },
  FolderOpenIcon: {
    sf: 'folder',
    material: 'folder_open',
    drift: 'SF Symbols has no open-folder variant; iOS falls back to the closed folder.',
  },
  GiftIcon: { sf: 'gift', material: 'redeem' },
  GlobeIcon: { sf: 'globe', material: 'public' },
  HeartPulseIcon: {
    sf: 'heart',
    material: 'monitor_heart',
    drift:
      'Health-permission heart: iOS drops the pulse line (Health-app metaphor is the bare heart).',
  },
  ImageIcon: { sf: 'photo', material: 'image' },
  ImageUpIcon: {
    sf: 'photo.badge.plus',
    material: 'add_photo_alternate',
    drift: 'Upload arrow becomes an add-photo badge on both platforms.',
  },
  ImagesIcon: { sf: 'photo.on.rectangle', material: 'photo_library' },
  InfoIcon: { sf: 'info.circle', material: 'info' },
  KeyRoundIcon: { sf: 'key', material: 'key' },
  LanguagesIcon: {
    sf: 'character.bubble',
    material: 'translate',
    drift: 'SF Symbols has no translate glyph; iOS shows a character bubble.',
  },
  LightbulbIcon: { sf: 'lightbulb', material: 'lightbulb' },
  // `checklist` mirrors the SF Symbol the iOS toolbar already passes for this same action.
  ListChecksIcon: { sf: 'checklist', material: 'checklist' },
  MailIcon: { sf: 'envelope', material: 'mail' },
  MapPinIcon: { sf: 'mappin', material: 'location_on' },
  MessageCircleIcon: { sf: 'message', material: 'chat_bubble' },
  MicIcon: { sf: 'mic', material: 'mic' },
  MinusIcon: { sf: 'minus', material: 'remove' },
  MonitorCloudIcon: {
    sf: 'externaldrive.badge.icloud',
    material: 'backup',
    drift:
      'Heaviest drift: no monitor+cloud combo exists. Mapped to the cloud-backup metaphor its call site (settings data screen) actually means.',
  },
  PaletteIcon: { sf: 'paintpalette', material: 'palette' },
  PauseIcon: { sf: 'pause', material: 'pause' },
  PencilIcon: { sf: 'pencil', material: 'edit' },
  PlayIcon: { sf: 'play', material: 'play_arrow' },
  PlusIcon: { sf: 'plus', material: 'add' },
  ProportionsIcon: {
    sf: 'aspectratio',
    material: 'aspect_ratio',
    drift: "Aspect-ratio rectangles instead of lucide's proportions frame.",
  },
  ReceiptTextIcon: {
    sf: 'list.bullet.rectangle.portrait',
    material: 'receipt_long',
    drift: 'SF Symbols has no receipt; iOS shows a bulleted document.',
  },
  RefreshCcwIcon: { sf: 'arrow.counterclockwise', material: 'sync' },
  RefreshCwIcon: { sf: 'arrow.clockwise', material: 'refresh' },
  RotateCcwIcon: {
    sf: 'arrow.counterclockwise',
    material: 'replay',
    drift: 'Converges with RefreshCcwIcon on iOS: both collapse to the counterclockwise arrow.',
  },
  RotateCwIcon: {
    sf: 'arrow.clockwise',
    material: 'rotate_right',
    drift: 'Converges with RefreshCwIcon on iOS: both collapse to the clockwise arrow.',
  },
  RssIcon: {
    sf: 'dot.radiowaves.up.forward',
    material: 'rss_feed',
    drift: 'SF Symbols has no RSS glyph; iOS shows forward radiowaves.',
  },
  SaveIcon: {
    sf: 'square.and.arrow.down',
    material: 'save',
    drift: 'SF Symbols has no floppy disk; iOS uses the save-into-box arrow.',
  },
  SearchIcon: { sf: 'magnifyingglass', material: 'search' },
  Settings2Icon: {
    sf: 'slider.horizontal.3',
    material: 'tune',
    drift: 'Converges with SlidersHorizontalIcon: both collapse to the platform sliders glyph.',
  },
  SettingsIcon: { sf: 'gearshape', material: 'settings' },
  ShieldCheckIcon: { sf: 'checkmark.shield', material: 'verified_user' },
  SlidersHorizontalIcon: { sf: 'slider.horizontal.3', material: 'tune' },
  SparklesIcon: { sf: 'sparkles', material: 'auto_awesome' },
  SpeechIcon: {
    sf: 'speaker.wave.2.bubble.left',
    material: 'text_to_speech',
    drift: 'TTS-model tag: platform glyphs say "spoken audio" rather than lucide\'s talking head.',
  },
  SquareArrowOutUpRightIcon: {
    sf: 'arrow.up.right.square',
    material: 'open_in_new',
    drift: 'Converges with ExternalLinkIcon — identical lucide semantics, identical mapping.',
  },
  SquareIcon: {
    sf: 'square',
    material: 'square',
    drift:
      'Composer stop button. Kept as the literal outline square; `stop.fill` is the Apple-native alternative if the outline reads too weak.',
  },
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
