import { cn } from 'heroui-native'
import {
  ArrowLeft,
  ArrowLeftRight,
  ArrowUp,
  ArrowUpRight,
  AtSign,
  AudioLines,
  BrushCleaning,
  Camera,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronsRight,
  CircleCheck,
  CircleDollarSign,
  CirclePause,
  CircleUserRound,
  Cloud,
  Copy,
  Copyright,
  Download,
  Edit3,
  Eye,
  EyeOff,
  FileText,
  Folder,
  FolderClosed,
  FolderOpen,
  FolderSearch2,
  Github,
  Globe,
  Hammer,
  HardDrive,
  HeartPulse,
  Image,
  ImageOff,
  Info,
  Languages,
  Lightbulb,
  Mail,
  Menu,
  MessageSquareDiff,
  MessageSquareMore,
  Minus,
  MoreHorizontal,
  Package,
  Palette,
  PenLine,
  Plus,
  RefreshCw,
  Repeat2,
  Rocket,
  RotateCcw,
  Rss,
  Save,
  ScanQrCode,
  Search,
  Settings,
  Settings2,
  Share,
  ShieldCheck,
  Sparkles,
  SquareFunction,
  Store,
  TextSelect,
  ThumbsUp,
  Trash2,
  TriangleAlert,
  Wifi,
  Wrench,
  X,
  XCircle
} from 'lucide-react-native'
import React from 'react'
import { withUniwind } from 'uniwind'

const createIcon = (IconComponent: React.ComponentType<any>) => {
  const UniwindIcon = withUniwind(IconComponent) as React.ComponentType<any>
  type IconProps = React.ComponentProps<typeof UniwindIcon>

  const IconWithDefaultColors = ({ className, ...props }: IconProps) => (
    <UniwindIcon {...props} className={cn('text-black dark:text-white', className)} />
  )

  const displayName = IconComponent.displayName ?? IconComponent.name ?? 'Icon'
  IconWithDefaultColors.displayName = displayName

  return IconWithDefaultColors
}

const SaveIcon = createIcon(Save)
const StoreIcon = createIcon(Store)
const HammerIcon = createIcon(Hammer)
const ArrowUpIcon = createIcon(ArrowUp)
const ArrowLeftIcon = createIcon(ArrowLeft)
const ArrowLeftRightIcon = createIcon(ArrowLeftRight)
const ArrowUpRightIcon = createIcon(ArrowUpRight)
const AtSignIcon = createIcon(AtSign)
const AudioLinesIcon = createIcon(AudioLines)
const BrushCleaningIcon = createIcon(BrushCleaning)
const CameraIcon = createIcon(Camera)
const CheckIcon = createIcon(Check)
const ChevronDownIcon = createIcon(ChevronDown)
const ChevronsRightIcon = createIcon(ChevronsRight)
const CircleCheckIcon = createIcon(CircleCheck)
const CircleDollarSignIcon = createIcon(CircleDollarSign)
const CirclePauseIcon = createIcon(CirclePause)
const CloudIcon = createIcon(Cloud)
const CopyIcon = createIcon(Copy)
const CopyrightIcon = createIcon(Copyright)
const DownloadIcon = createIcon(Download)
const Edit3Icon = createIcon(Edit3)
const EyeIcon = createIcon(Eye)
const EyeOffIcon = createIcon(EyeOff)
const FileTextIcon = createIcon(FileText)
const FolderIcon = createIcon(Folder)
const FolderClosedIcon = createIcon(FolderClosed)
const FolderOpenIcon = createIcon(FolderOpen)
const FolderSearch2Icon = createIcon(FolderSearch2)
const GithubIcon = createIcon(Github)
const GlobeIcon = createIcon(Globe)
const HardDriveIcon = createIcon(HardDrive)
const HeartPulseIcon = createIcon(HeartPulse)
const PaletteIcon = createIcon(Palette)
const ImageIcon = createIcon(Image)
const ImageOffIcon = createIcon(ImageOff)
const InfoIcon = createIcon(Info)
const LanguagesIcon = createIcon(Languages)
const LightbulbIcon = createIcon(Lightbulb)
const CircleUserRoundIcon = createIcon(CircleUserRound)
const MailIcon = createIcon(Mail)
const MenuIcon = createIcon(Menu)
const MessageSquareDiffIcon = createIcon(MessageSquareDiff)
const MessageSquareMoreIcon = createIcon(MessageSquareMore)
const MinusIcon = createIcon(Minus)
const MoreHorizontalIcon = createIcon(MoreHorizontal)
const PackageIcon = createIcon(Package)
const PenLineIcon = createIcon(PenLine)
const PlusIcon = createIcon(Plus)
const SquareFunctionIcon = createIcon(SquareFunction)
const RefreshCwIcon = createIcon(RefreshCw)
const Repeat2Icon = createIcon(Repeat2)
const RocketIcon = createIcon(Rocket)
const RotateCcwIcon = createIcon(RotateCcw)
const RssIcon = createIcon(Rss)
const ScanQrCodeIcon = createIcon(ScanQrCode)
const SearchIcon = createIcon(Search)
const Settings2Icon = createIcon(Settings2)
const ChevronRightIcon = createIcon(ChevronRight)
const ShareIcon = createIcon(Share)
const ShieldCheckIcon = createIcon(ShieldCheck)
const SparklesIcon = createIcon(Sparkles)
const WrenchIcon = createIcon(Wrench)
const TextSelectIcon = createIcon(TextSelect)
const ThumbsUpIcon = createIcon(ThumbsUp)
const Trash2Icon = createIcon(Trash2)
const TriangleAlertIcon = createIcon(TriangleAlert)
const WifiIcon = createIcon(Wifi)
const XIcon = createIcon(X)
const XCircleIcon = createIcon(XCircle)
const SettingsIcon = createIcon(Settings)

export {
  ArrowLeftIcon as ArrowLeft,
  ArrowLeftRightIcon as ArrowLeftRight,
  ArrowUpIcon as ArrowUp,
  ArrowUpRightIcon as ArrowUpRight,
  AtSignIcon as AtSign,
  AudioLinesIcon as AudioLines,
  BrushCleaningIcon as BrushCleaning,
  CameraIcon as Camera,
  CheckIcon as Check,
  ChevronDownIcon as ChevronDown,
  ChevronRightIcon as ChevronRight,
  ChevronsRightIcon as ChevronsRight,
  CircleCheckIcon as CircleCheck,
  CircleDollarSignIcon as CircleDollarSign,
  CirclePauseIcon as CirclePause,
  CircleUserRoundIcon as CircleUserRound,
  CloudIcon as Cloud,
  CopyIcon as Copy,
  CopyrightIcon as Copyright,
  DownloadIcon as Download,
  Edit3Icon as Edit3,
  EyeIcon as Eye,
  EyeOffIcon as EyeOff,
  FileTextIcon as FileText,
  FolderIcon as Folder,
  FolderClosedIcon as FolderClosed,
  FolderOpenIcon as FolderOpen,
  FolderSearch2Icon as FolderSearch2,
  GithubIcon as Github,
  GlobeIcon as Globe,
  HammerIcon as Hammer,
  HardDriveIcon as HardDrive,
  HeartPulseIcon as HeartPulse,
  ImageIcon as Image,
  ImageOffIcon as ImageOff,
  InfoIcon as Info,
  LanguagesIcon as Languages,
  LightbulbIcon as Lightbulb,
  MailIcon as Mail,
  MenuIcon as Menu,
  MessageSquareDiffIcon as MessageSquareDiff,
  MessageSquareMoreIcon as MessageSquareMore,
  MinusIcon as Minus,
  MoreHorizontalIcon as MoreHorizontal,
  PackageIcon as Package,
  PaletteIcon as Palette,
  PenLineIcon as PenLine,
  PlusIcon as Plus,
  RefreshCwIcon as RefreshCw,
  Repeat2Icon as Repeat2,
  RocketIcon as Rocket,
  RotateCcwIcon as RotateCcw,
  RssIcon as Rss,
  SaveIcon as Save,
  ScanQrCodeIcon as ScanQrCode,
  SearchIcon as Search,
  SettingsIcon as Settings,
  Settings2Icon as Settings2,
  ShareIcon as Share,
  ShieldCheckIcon as ShieldCheck,
  SparklesIcon as Sparkles,
  SquareFunctionIcon as SquareFunction,
  StoreIcon as Store,
  TextSelectIcon as TextSelect,
  ThumbsUpIcon as ThumbsUp,
  Trash2Icon as Trash2,
  TriangleAlertIcon as TriangleAlert,
  WifiIcon as Wifi,
  WrenchIcon as Wrench,
  XIcon as X,
  XCircleIcon as XCircle
}
