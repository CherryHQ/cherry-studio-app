import {
  BottomSheetBody,
  BottomSheetContent,
  BottomSheetFooter,
  BottomSheetRoot,
  BottomSheetScrollView,
  BottomSheetSearchField,
  BottomSheetTrigger,
} from './bottom-sheet';
import {
  BottomSheetBackButton,
  BottomSheetCloseButton,
  BottomSheetHeader,
  BottomSheetHeaderSpacer,
  BottomSheetTitle,
} from './bottom-sheet-header';
import { BottomSheetPageTransition } from './bottom-sheet-page-transition';
import { BottomSheetSelection } from './bottom-sheet-selection';

export const BottomSheet = Object.assign(BottomSheetRoot, {
  BackButton: BottomSheetBackButton,
  Body: BottomSheetBody,
  CloseButton: BottomSheetCloseButton,
  Content: BottomSheetContent,
  Footer: BottomSheetFooter,
  Header: BottomSheetHeader,
  HeaderSpacer: BottomSheetHeaderSpacer,
  PageTransition: BottomSheetPageTransition,
  ScrollView: BottomSheetScrollView,
  SearchField: BottomSheetSearchField,
  Selection: BottomSheetSelection,
  Title: BottomSheetTitle,
  Trigger: BottomSheetTrigger,
});
