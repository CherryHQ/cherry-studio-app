#import <UIKit/UIKit.h>

NS_ASSUME_NONNULL_BEGIN

/// Reads iOS 27.1 reserved regions. Objective-C keeps the calls behind a compile-time SDK check,
/// so builds made with an older SDK still compile and simply report no fold.
@interface FoldRegionReader : NSObject

/// The division region in window coordinates: `x`, `y`, `width`, `height`, and `isActive`.
/// Inactive regions are included, because a flat device still has a fold line worth knowing.
/// Nil when the view is not in a window or the device has no fold.
+ (nullable NSDictionary<NSString *, id> *)divisionRegionInView:(UIView *)view;

/// Calls `onChange` whenever the hinge changes. Returns the interaction to keep, or nil when
/// hinge updates are unavailable.
+ (nullable id)observeHingeOfView:(UIView *)view onChange:(void (^)(void))onChange;

@end

NS_ASSUME_NONNULL_END
