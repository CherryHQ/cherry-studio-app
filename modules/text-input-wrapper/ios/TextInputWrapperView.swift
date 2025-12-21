import ExpoModulesCore
import UIKit
import ObjectiveC
import ImageIO

// Association key for storing the wrapper view reference on text input views
private var textInputWrapperKey: UInt8 = 0

// Weak wrapper to avoid retain cycles
private class WeakWrapper {
  weak var value: TextInputWrapperView?
  init(_ value: TextInputWrapperView) {
    self.value = value
  }
}

// Protocol to identify text input views that can be enhanced
private protocol TextInputEnhanceable: UIView {
  func canPerformAction(_ action: Selector, withSender sender: Any?) -> Bool
  func paste(_ sender: Any?)
}

extension UITextField: TextInputEnhanceable {}
extension UITextView: TextInputEnhanceable {}

class TextInputWrapperView: ExpoView {
  private let onPaste = EventDispatcher()
  private var textInputView: UIView?
  private var isMonitoring: Bool = false
  // Track which classes have been swizzled (once per class, never unswizzle)
  private static var swizzledClasses: Set<String> = []
  
  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    clipsToBounds = false
    backgroundColor = .clear
    // Keep user interaction enabled so we can monitor, but pass through touches
    isUserInteractionEnabled = true
  }
  
  // Pass through all touch events to children - never intercept
  override func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? {
    // Always delegate to super first to check children
    let hitView = super.hitTest(point, with: event)
    
    // If we hit ourselves or nothing, return nil to pass through
    if hitView == self || hitView == nil {
      return nil
    }
    
    // Return the child view that was hit
    return hitView
  }
  
  override func point(inside point: CGPoint, with event: UIEvent?) -> Bool {
    // Only return true if a child contains the point
    for subview in subviews.reversed() {
      let convertedPoint = subview.convert(point, from: self)
      if subview.point(inside: convertedPoint, with: event) {
        return true
      }
    }
    // Never claim the point for ourselves
    return false
  }
  
  override func didMoveToSuperview() {
    super.didMoveToSuperview()
    if superview != nil {
      startMonitoring()
    } else {
      stopMonitoring()
    }
  }
  
  override func didAddSubview(_ subview: UIView) {
    super.didAddSubview(subview)
    startMonitoring()
  }
  
  private func startMonitoring() {
    guard !isMonitoring else { return }
    
    // Find TextInput in view hierarchy
    textInputView = findTextInputInView(self)
    
    if let textInput = textInputView {
      isMonitoring = true
      enhanceTextInput(textInput)
    }
  }
  
  private func stopMonitoring() {
    guard isMonitoring else { return }
    isMonitoring = false
    
    // Only clear the association; swizzling stays global and is guarded
    if let textInput = textInputView {
      restoreTextInput(textInput)
    }
    textInputView = nil
  }
  
  private func enhanceTextInput(_ view: UIView) {
    // Store weak reference to this wrapper on the text input view to avoid retain cycles
    objc_setAssociatedObject(view, &textInputWrapperKey, WeakWrapper(self), .OBJC_ASSOCIATION_RETAIN_NONATOMIC)
    
    // Swizzle canPerformAction and paste methods (once per class, never unswizzle)
    swizzleTextInputMethods(view)
  }
  
  private func restoreTextInput(_ view: UIView) {
    // Only clear the association; swizzling stays global and is guarded
    objc_setAssociatedObject(view, &textInputWrapperKey, nil, .OBJC_ASSOCIATION_ASSIGN)
  }
  
  private func swizzleTextInputMethods(_ view: UIView) {
    let viewClass: AnyClass = type(of: view)
    let className = String(describing: viewClass)
    
    // Swizzle once per class, never unswizzle
    guard !TextInputWrapperView.swizzledClasses.contains(className) else {
      return
    }
    
    var originalCanPerformIMP: IMP? = nil
    var originalPasteIMP: IMP? = nil
    var didSwizzle = false
    
    // Swizzle canPerformAction (once per class)
    let canPerformSelector = #selector(UIResponder.canPerformAction(_:withSender:))
    let swizzledCanPerformSelector = NSSelectorFromString("_textInputWrapper_canPerformAction:withSender:")
    
    if let originalMethod = class_getInstanceMethod(viewClass, canPerformSelector) {
      originalCanPerformIMP = method_getImplementation(originalMethod)
      
      // Only add swizzled method if it doesn't exist
      if class_getInstanceMethod(viewClass, swizzledCanPerformSelector) == nil {
        let swizzledImplementation: @convention(block) (AnyObject, Selector, Any?) -> Bool = { object, action, sender in
          // Check if this text input is associated with a wrapper
          if let weakWrapper = objc_getAssociatedObject(object, &textInputWrapperKey) as? WeakWrapper,
             weakWrapper.value != nil {
            // Only process if this is our wrapped text input
            if action == #selector(UIResponderStandardEditActions.paste(_:)) {
              let pasteboard = UIPasteboard.general
              if pasteboard.hasImages || pasteboard.hasStrings {
                return true
              }
            }
          }
          
          // Call original implementation
          if let originalIMP = originalCanPerformIMP {
            typealias OriginalIMP = @convention(c) (AnyObject, Selector, Selector, Any?) -> Bool
            let originalFunction = unsafeBitCast(originalIMP, to: OriginalIMP.self)
            return originalFunction(object, canPerformSelector, action, sender)
          }
          return false
        }
        
        let blockIMP = imp_implementationWithBlock(unsafeBitCast(swizzledImplementation, to: AnyObject.self))
        let types = method_getTypeEncoding(originalMethod)
        
        if class_addMethod(viewClass, swizzledCanPerformSelector, blockIMP, types) {
          if let swizzledMethod = class_getInstanceMethod(viewClass, swizzledCanPerformSelector) {
            method_exchangeImplementations(originalMethod, swizzledMethod)
            didSwizzle = true
          }
        }
      }
    }
    
    // Swizzle paste method (once per class)
    let pasteSelector = #selector(UIResponderStandardEditActions.paste(_:))
    let swizzledPasteSelector = NSSelectorFromString("_textInputWrapper_paste:")
    
    if let originalMethod = class_getInstanceMethod(viewClass, pasteSelector) {
      originalPasteIMP = method_getImplementation(originalMethod)
      
      // Only add swizzled method if it doesn't exist
      if class_getInstanceMethod(viewClass, swizzledPasteSelector) == nil {
        let swizzledImplementation: @convention(block) (AnyObject, Any?) -> Void = { object, sender in
          // Check if this text input is associated with a wrapper
          guard let weakWrapper = objc_getAssociatedObject(object, &textInputWrapperKey) as? WeakWrapper,
                let wrapper = weakWrapper.value else {
            // Not our text input, call original and return
            if let originalIMP = originalPasteIMP {
              typealias OriginalIMP = @convention(c) (AnyObject, Selector, Any?) -> Void
              let originalFunction = unsafeBitCast(originalIMP, to: OriginalIMP.self)
              originalFunction(object, pasteSelector, sender)
            }
            return
          }
          
          let pasteboard = UIPasteboard.general
          
          // CRITICAL: Check for GIFs FIRST using explicit type queries
          // This gets raw data without triggering UIImage conversion
          let gifTypes = ["com.compuserve.gif", "public.gif", "image/gif"]
          var hasGIF = false
          for gifType in gifTypes {
            if let gifData = pasteboard.data(forPasteboardType: gifType), !gifData.isEmpty {
              hasGIF = true
              break
            }
          }
          
          // Also check items for GIF data (but be careful not to trigger conversion)
          if !hasGIF {
            for item in pasteboard.items {
              for (key, _) in item {
                if gifTypes.contains(key) || key.lowercased().contains("gif") {
                  hasGIF = true
                  break
                }
              }
              if hasGIF { break }
            }
          }
          
          // If we have a GIF, process it immediately without touching hasImages
          if hasGIF {
            DispatchQueue.main.async {
              wrapper.processPasteboardContent()
            }
            return // Don't call original paste for GIFs
          }
          
          // Check for other image data (but not GIFs, already handled)
          var hasImageData = false
          for item in pasteboard.items {
            for (key, value) in item {
              // Skip GIF-related keys
              if key.lowercased().contains("gif") {
                continue
              }
              
              // Check if this looks like image data
              let isImageKey = key.contains("image") || key.contains("png") || key.contains("jpeg") || 
                              key.contains("jpg") || key.contains("tiff")
              
              if isImageKey && (value is Data || value is UIImage) {
                hasImageData = true
                break
              } else if value is UIImage {
                hasImageData = true
                break
              }
            }
            if hasImageData { break }
          }
          
          // If we found potential image data, process it
          if hasImageData {
            DispatchQueue.main.async {
              wrapper.processPasteboardContent()
            }
            return // Don't call original paste for images
          }
          
          // Fallback: check hasImages only if no image data found in items
          // This is safer as we've already checked for GIFs above
          if pasteboard.hasImages {
            DispatchQueue.main.async {
              wrapper.processPasteboardContent()
            }
            return // Don't call original paste for images
          }
          
          // Handle text - call original paste first, then notify
          if let originalIMP = originalPasteIMP {
            typealias OriginalIMP = @convention(c) (AnyObject, Selector, Any?) -> Void
            let originalFunction = unsafeBitCast(originalIMP, to: OriginalIMP.self)
            originalFunction(object, pasteSelector, sender)
          }
          
          // Notify about text paste
          if pasteboard.hasStrings {
            DispatchQueue.main.async {
              wrapper.processTextPaste()
            }
          }
        }
        
        let blockIMP = imp_implementationWithBlock(unsafeBitCast(swizzledImplementation, to: AnyObject.self))
        let types = method_getTypeEncoding(originalMethod)
        
        if class_addMethod(viewClass, swizzledPasteSelector, blockIMP, types) {
          if let swizzledMethod = class_getInstanceMethod(viewClass, swizzledPasteSelector) {
            method_exchangeImplementations(originalMethod, swizzledMethod)
            didSwizzle = true
          }
        }
      }
    }
    
    // Mark this class as swizzled only if we successfully swizzled at least one method
    // (once per class, never unswizzle)
    if didSwizzle {
      TextInputWrapperView.swizzledClasses.insert(className)
    }
  }
  
  private func findTextInputInView(_ view: UIView) -> UIView? {
    let className = String(describing: type(of: view))
    if className.contains("RCTUITextField") || className.contains("RCTUITextView") ||
       className.contains("UITextField") || className.contains("UITextView") {
      return view
    }
    
    for subview in view.subviews {
      if let found = findTextInputInView(subview) {
        return found
      }
    }
    
    return nil
  }
  
  private func processPasteboardContent() {
    // This method is only called for image pastes
    let pasteboard = UIPasteboard.general
    
    let gifTypes: Set<String> = ["com.compuserve.gif", "public.gif", "image/gif"]
    let staticImageTypes = ["public.png", "public.jpeg", "public.tiff", "public.heic", "public.image"]
    
    var gifDataItems: [Data] = []
    var staticImages: [UIImage] = []
    var processedGifHashes = Set<Int>()
    
    // Get all items once to ensure consistent access
    let items = pasteboard.items
    let itemCount = items.count
    
    // Process each pasteboard item individually
    // This ensures correct handling of mixed GIF and static image pastes
    for itemIndex in 0..<itemCount {
      let item = items[itemIndex]
      let itemKeys = Set(item.keys) // Types available for THIS specific item
      let singleItemSet = IndexSet(integer: itemIndex)
      
      var itemIsGif = false
      var gifDataForItem: Data? = nil
      
      // ===== STEP 1: Check if this item is a GIF =====
      // Check if any of this item's keys indicate it's a GIF
      let itemGifKeys = itemKeys.filter { key in
        gifTypes.contains(key) || key.lowercased().contains("gif")
      }
      
      // Try to extract GIF data from this item
      for gifKey in itemGifKeys {
        // Method 1: Try to get data from the item dictionary directly
        if let gifData = item[gifKey] as? Data, !gifData.isEmpty, isGIFData(gifData) {
          gifDataForItem = gifData
          itemIsGif = true
          break
        }
        
        // Method 2: Use pasteboard API for this specific item
        if let dataArray = pasteboard.data(forPasteboardType: gifKey, inItemSet: singleItemSet),
           let gifData = dataArray.first,
           !gifData.isEmpty, isGIFData(gifData) {
          gifDataForItem = gifData
          itemIsGif = true
          break
        }
      }
      
      // If found a GIF, add it and continue to next item
      if itemIsGif, let gifData = gifDataForItem {
        let hash = gifData.hashValue
        if !processedGifHashes.contains(hash) {
          gifDataItems.append(gifData)
          processedGifHashes.insert(hash)
        }
        continue // Skip static image extraction for this item
      }
      
      // ===== STEP 2: This item is NOT a GIF - extract static image =====
      var extractedImage: UIImage? = nil
      
      // Try each static image type in order of preference (only if this item has that type)
      for imageType in staticImageTypes {
        guard itemKeys.contains(imageType) else { continue }
        
        // Method 1: Try item dictionary directly
        if let imageData = item[imageType] as? Data, !imageData.isEmpty, !isGIFData(imageData) {
          if let image = safeCreateImage(from: imageData) {
            extractedImage = image
            break
          }
        }
        
        // Method 2: Use pasteboard API
        if extractedImage == nil,
           let dataArray = pasteboard.data(forPasteboardType: imageType, inItemSet: singleItemSet),
           let imageData = dataArray.first,
           !imageData.isEmpty, !isGIFData(imageData) {
          if let image = safeCreateImage(from: imageData) {
            extractedImage = image
            break
          }
        }
      }
      
      // Fallback: Try any non-GIF image data from the item dictionary
      if extractedImage == nil {
        // Sort keys to have consistent ordering (prefer png, jpeg, then others)
        let sortedKeys = itemKeys.sorted { k1, k2 in
          let priority1 = k1.contains("png") ? 0 : (k1.contains("jpeg") || k1.contains("jpg") ? 1 : 2)
          let priority2 = k2.contains("png") ? 0 : (k2.contains("jpeg") || k2.contains("jpg") ? 1 : 2)
          return priority1 < priority2
        }
        
        for key in sortedKeys {
          // Skip GIF-related keys
          if key.lowercased().contains("gif") {
            continue
          }
          
          // Try Data
          if let imageData = item[key] as? Data, imageData.count >= 6, !isGIFData(imageData) {
            if let image = safeCreateImage(from: imageData) {
              extractedImage = image
              break
            }
          }
          
          // Try UIImage
          if let image = item[key] as? UIImage, image.size.width > 0, image.size.height > 0 {
            extractedImage = image
            break
          }
        }
      }
      
      // Add the extracted static image
      if let image = extractedImage {
        staticImages.append(image)
      }
    }
    
    // Final fallback: If nothing was extracted at all, try pasteboard.image
    if staticImages.isEmpty && gifDataItems.isEmpty, let image = pasteboard.image {
      staticImages.append(image)
    }
    
    // Use the collected data
    let images = staticImages
    
    // Handle both GIFs and static images together
    if !gifDataItems.isEmpty || !images.isEmpty {
      // Combine GIFs and static images into one paste event
      var allFilePaths: [String] = []
      
      // First, add GIF file paths
      if !gifDataItems.isEmpty {
        let tempDir = FileManager.default.temporaryDirectory
        for gifData in gifDataItems {
          let fileName = UUID().uuidString + ".gif"
          let fileURL = tempDir.appendingPathComponent(fileName)
          
          do {
            try gifData.write(to: fileURL)
            let filePath = "file://" + fileURL.path
            allFilePaths.append(filePath)
          } catch {
            continue // Skip this GIF if we can't save it
          }
        }
      }
      
      // Then, add static image file paths
      if !images.isEmpty {
        for image in images {
          // Preserve transparency for images with alpha channel
          let imageData: Data?
          if image.hasAlpha {
            imageData = image.pngData()
          } else {
            imageData = image.jpegData(compressionQuality: 0.8)
          }
          
          guard let imageData = imageData else {
            continue // Skip this image if we can't compress it
          }
          
          let tempDir = FileManager.default.temporaryDirectory
          let fileExtension = image.hasAlpha ? ".png" : ".jpg"
          let fileName = UUID().uuidString + fileExtension
          let fileURL = tempDir.appendingPathComponent(fileName)
          
          do {
            try imageData.write(to: fileURL)
            let filePath = "file://" + fileURL.path
            allFilePaths.append(filePath)
          } catch {
            continue // Skip this image if we can't save it
          }
        }
      }
      
      if !allFilePaths.isEmpty {
        // Send all images (GIFs and static) in one event
        onPaste([
          "type": "images",
          "uris": allFilePaths
        ])
      } else {
        handleUnsupportedPaste()
      }
    } else {
      // If we have neither GIFs nor images, treat as unsupported
      handleUnsupportedPaste()
    }
  }
  
  /// Detects if the given data is a GIF by checking for GIF87a or GIF89a header
  private func isGIFData(_ data: Data) -> Bool {
    guard data.count >= 6 else { return false }
    
    // Check for GIF signature: "GIF87a" or "GIF89a"
    let gif87aSignature: [UInt8] = [0x47, 0x49, 0x46, 0x38, 0x37, 0x61] // "GIF87a"
    let gif89aSignature: [UInt8] = [0x47, 0x49, 0x46, 0x38, 0x39, 0x61] // "GIF89a"
    
    let header = data.prefix(6)
    let headerBytes = [UInt8](header)
    
    return headerBytes == gif87aSignature || headerBytes == gif89aSignature
  }
  
  /// Safely creates a UIImage from data, validating it first to prevent ImageIO errors
  private func safeCreateImage(from data: Data) -> UIImage? {
    guard data.count > 0 else { return nil }
    
    // Use ImageIO to validate the data before creating UIImage
    // This prevents ImageIO errors from corrupted or invalid image data
    guard let imageSource = CGImageSourceCreateWithData(data as CFData, nil) else {
      return nil
    }
    
    // Check if the image source has at least one image
    guard CGImageSourceGetCount(imageSource) > 0 else {
      return nil
    }
    
    // Get the first image from the source
    guard let cgImage = CGImageSourceCreateImageAtIndex(imageSource, 0, nil) else {
      return nil
    }
    
    // Create UIImage from CGImage (this is safer than UIImage(data:))
    let image = UIImage(cgImage: cgImage)
    
    // Validate the image has valid dimensions
    guard image.size.width > 0 && image.size.height > 0 else {
      return nil
    }
    
    return image
  }
  
  private func processTextPaste() {
    // This method is only called for text pastes
    let pasteboard = UIPasteboard.general
    
    // Check for text using pasteboard.string
    if let text = pasteboard.string, !text.isEmpty {
      handleTextPaste(text)
      return
    }
    
    // No text found - don't trigger unsupported, just ignore
  }
  
  private func handleTextPaste(_ text: String) {
    onPaste([
      "type": "text",
      "value": text
    ])
  }
  
  private func handleUnsupportedPaste() {
    onPaste([
      "type": "unsupported"
    ])
  }
  
  deinit {
    stopMonitoring()
  }
}

extension UIImage {
  var hasAlpha: Bool {
    guard let cgImage = self.cgImage else { return false }
    let alphaInfo = cgImage.alphaInfo
    return alphaInfo != .none && alphaInfo != .noneSkipFirst && alphaInfo != .noneSkipLast
  }
}
