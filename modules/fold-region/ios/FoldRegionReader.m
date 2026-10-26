#import "FoldRegionReader.h"

// The reserved-region and hinge APIs first ship in the iOS 27.1 SDK.
#if defined(__IPHONE_OS_VERSION_MAX_ALLOWED) && __IPHONE_OS_VERSION_MAX_ALLOWED >= 270100
#define FOLD_REGION_SDK_AVAILABLE 1
#endif

@implementation FoldRegionReader

+ (nullable NSDictionary<NSString *, id> *)divisionRegionInView:(UIView *)view
{
#ifdef FOLD_REGION_SDK_AVAILABLE
  if (@available(iOS 27.1, *)) {
    if (view.window == nil) return nil;
    NSArray<UIViewReservedRegion *> *regions =
        [view reservedRegionsOfKind:[UIViewReservedRegionKind divisionRegionKind]
                            options:UIViewReservedRegionQueryOptionsIncludeInactive];
    UIViewReservedRegion *fold = nil;
    for (UIViewReservedRegion *region in regions) {
      if (fold == nil || (region.isActive && !fold.isActive)) fold = region;
    }
    if (fold == nil) return nil;
    // Frames are in the queried view's space; the layout compares them with window positions.
    CGRect frame = [view convertRect:fold.frame toView:nil];
    return @{
      @"x" : @(frame.origin.x),
      @"y" : @(frame.origin.y),
      @"width" : @(frame.size.width),
      @"height" : @(frame.size.height),
      @"isActive" : @(fold.isActive),
    };
  }
#endif
  return nil;
}

+ (nullable id)observeHingeOfView:(UIView *)view onChange:(void (^)(void))onChange
{
#ifdef FOLD_REGION_SDK_AVAILABLE
  if (@available(iOS 27.1, *)) {
    UIHingeInteraction *interaction = [[UIHingeInteraction alloc]
        initWithUpdateHandler:^(UIHingeInteraction *_, UIHingeInteractionUpdate *__) {
          onChange();
        }];
    [view addInteraction:interaction];
    return interaction;
  }
#endif
  return nil;
}

@end
