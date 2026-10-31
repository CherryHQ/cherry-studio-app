// Build and run explicitly on an owned iOS simulator; see development.md.
// This exercises the installed patch's real UIKit measurement, not a JS mock.
#import "ENRMInputMeasurement.h"
#include <atomic>
#include <cstdio>
#include <cstdlib>

static void require(bool condition, const char *message)
{
  if (!condition) {
    fprintf(stderr, "FAIL: %s\n", message);
    exit(1);
  }
}

static CGSize previousMeasurement(NSAttributedString *text, NSDictionary *typingAttributes, CGFloat width)
{
  NSMutableAttributedString *content = [text mutableCopy];
  if (content.length == 0 ||
      [[NSCharacterSet newlineCharacterSet] characterIsMember:[content.string characterAtIndex:content.length - 1]]) {
    [content appendAttributedString:[[NSAttributedString alloc] initWithString:@"I" attributes:typingAttributes]];
  }
  CGRect rect = [content boundingRectWithSize:CGSizeMake(width, CGFLOAT_MAX)
                                    options:NSStringDrawingUsesLineFragmentOrigin | NSStringDrawingUsesFontLeading
                                    context:nil];
  return CGSizeMake(width, ceil(rect.size.height));
}

static CGSize measureWhileMainIsBlocked(NSAttributedString *snapshot, CGFloat width)
{
  require(NSThread.isMainThread, "harness must block the main thread");
  dispatch_semaphore_t done = dispatch_semaphore_create(0);
  __block CGSize size = CGSizeZero;
  dispatch_async(dispatch_get_global_queue(QOS_CLASS_USER_INITIATED, 0), ^{
    size = ENRMMeasureInputText(snapshot, width);
    dispatch_semaphore_signal(done);
  });
  // No run loop pumping: a dispatch_sync(main) regression must time out here.
  require(dispatch_semaphore_wait(done, dispatch_time(DISPATCH_TIME_NOW, 5 * NSEC_PER_SEC)) == 0,
          "measurement waited for the blocked main thread");
  return size;
}

static void requireSize(CGSize actual, CGSize expected, const char *message)
{
  if (!CGSizeEqualToSize(actual, expected)) {
    fprintf(stderr, "%s: actual %.2f x %.2f, expected %.2f x %.2f\n", message,
            actual.width, actual.height, expected.width, expected.height);
  }
  require(fabs(actual.width - expected.width) < 0.01 && fabs(actual.height - expected.height) < 0.01, message);
}

int main(void)
{
  @autoreleasepool {
    UIFont *font = [UIFont systemFontOfSize:18];
    NSDictionary *typing = @{NSFontAttributeName : font};
    NSArray<NSString *> *cases = @[
      @"", @"Hello", @"第一行\n第二行\n", @"مرحبا بالعالم\nEnglish 😀",
      @"A long draft that wraps onto several lines when the fold changes the available width."
    ];
    for (NSString *content in cases) {
      NSAttributedString *text = [[NSAttributedString alloc] initWithString:content attributes:typing];
      NSAttributedString *snapshot = ENRMInputMeasurementText(text, typing);
      for (NSNumber *width in @[@80, @240, @600]) {
        CGSize actual = measureWhileMainIsBlocked(snapshot, width.doubleValue);
        requireSize(actual, previousMeasurement(text, typing, width.doubleValue), "plain text/empty/newline parity");
      }
    }
    puts("PASS: background measurement completes with main blocked; empty, trailing newline, CJK, RTL and emoji match");

    NSMutableParagraphStyle *paragraph = [NSMutableParagraphStyle new];
    paragraph.headIndent = 24;
    paragraph.firstLineHeadIndent = 24;
    paragraph.paragraphSpacingBefore = 6;
    paragraph.baseWritingDirection = NSWritingDirectionRightToLeft;
    NSMutableAttributedString *rich = [[NSMutableAttributedString alloc]
        initWithString:@"\uFFFC mention\nA long draft with a heading and list indentation that must reflow when folded."
             attributes:@{NSFontAttributeName : font, NSParagraphStyleAttributeName : paragraph}];
    [rich addAttribute:NSFontAttributeName value:[UIFont boldSystemFontOfSize:30] range:NSMakeRange(10, 12)];
    NSTextAttachment *attachment = [NSTextAttachment new];
    attachment.bounds = CGRectMake(0, font.descender, 18, 18);
    [rich addAttribute:NSAttachmentAttributeName value:attachment range:NSMakeRange(0, 1)];
    NSAttributedString *snapshot = ENRMInputMeasurementText(rich, typing);
    CGSize narrow = measureWhileMainIsBlocked(snapshot, 120);
    CGSize wide = measureWhileMainIsBlocked(snapshot, 600);
    requireSize(narrow, previousMeasurement(rich, typing, 120), "rich narrow width parity");
    requireSize(wide, previousMeasurement(rich, typing, 600), "rich wide width parity");
    require(narrow.height > wide.height, "new width must reflow the same snapshot");

    // A shallow attributed-string copy would retain this mutable paragraph and
    // attachment. Editing the live input must not change an in-flight layout.
    paragraph.headIndent = 100;
    paragraph.firstLineHeadIndent = 100;
    attachment.bounds = CGRectMake(0, 0, 200, 200);
    [rich replaceCharactersInRange:NSMakeRange(0, rich.length) withString:@"Replaced"];
    requireSize(measureWhileMainIsBlocked(snapshot, 120), narrow, "snapshot changed after editing source objects");
    requireSize(measureWhileMainIsBlocked(snapshot, 600), wide, "snapshot retained mutable attachment/style");
    puts("PASS: fresh-width layout and immutable text, paragraph and attachment snapshots");

    std::atomic<int> failures{0};
    auto *failureCount = &failures;
    dispatch_group_t group = dispatch_group_create();
    for (int worker = 0; worker < 4; worker++) {
      dispatch_group_async(group, dispatch_get_global_queue(QOS_CLASS_USER_INITIATED, 0), ^{
        for (int iteration = 0; iteration < 40; iteration++) {
          CGFloat width = iteration % 2 == 0 ? 120 : 600;
          CGSize size = ENRMMeasureInputText(snapshot, width);
          CGSize expected = iteration % 2 == 0 ? narrow : wide;
          if (!CGSizeEqualToSize(size, expected)) failureCount->fetch_add(1);
        }
      });
    }
    require(dispatch_group_wait(group, dispatch_time(DISPATCH_TIME_NOW, 10 * NSEC_PER_SEC)) == 0,
            "concurrent layout waited for main");
    require(failures.load() == 0, "concurrent measurements shared mutable layout state");
    puts("PASS: 160 concurrent measurements preserve sizes with main blocked");
  }
  return 0;
}
