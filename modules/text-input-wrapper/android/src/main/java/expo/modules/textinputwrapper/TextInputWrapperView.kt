package expo.modules.textinputwrapper

import android.content.ClipboardManager
import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.os.Build
import android.view.View
import android.view.ViewGroup
import android.view.ActionMode
import android.widget.EditText
import androidx.core.view.ContentInfoCompat
import androidx.core.view.OnReceiveContentListener
import androidx.core.view.ViewCompat
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView
import java.io.File
import java.io.FileOutputStream
import java.io.InputStream
import java.io.IOException

class TextInputWrapperView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
  private val onPaste by EventDispatcher()
  private var textInputView: EditText? = null
  private var isMonitoring: Boolean = false
  private var contentListener: OnReceiveContentListener? = null
  private var originalActionModeCallback: ActionMode.Callback? = null
  private var customActionModeCallback: ActionMode.Callback? = null
  
  init {
    setBackgroundColor(android.graphics.Color.TRANSPARENT)
    isClickable = false
    isFocusable = false
    isFocusableInTouchMode = false
    isEnabled = true
    
    addOnAttachStateChangeListener(object : View.OnAttachStateChangeListener {
      override fun onViewAttachedToWindow(v: View) {
        startMonitoring()
      }
      
      override fun onViewDetachedFromWindow(v: View) {
        stopMonitoring()
      }
    })
  }
  
  override fun onInterceptTouchEvent(ev: android.view.MotionEvent?): Boolean {
    return false
  }
  
  override fun onTouchEvent(event: android.view.MotionEvent?): Boolean {
    return false
  }
  
  override fun dispatchTouchEvent(ev: android.view.MotionEvent?): Boolean {
    return super.dispatchTouchEvent(ev)
  }
  
  override fun onViewAdded(child: View?) {
    super.onViewAdded(child)
    if (!isMonitoring) {
      startMonitoring()
    } else {
      val newTextInput = findTextInputInView(child)
      if (newTextInput != null && newTextInput != textInputView) {
        stopMonitoring()
        startMonitoring()
      }
    }
  }
  
  private fun startMonitoring() {
    if (isMonitoring) return
    
    val foundTextInput = findTextInputInView(this) as? EditText
    
    if (foundTextInput != null) {
      textInputView = foundTextInput
      isMonitoring = true
      setupPasteHandling(foundTextInput)
    }
  }
  
  private fun stopMonitoring() {
    if (!isMonitoring) return
    
    val editText = textInputView
    if (editText != null) {
      cleanupPasteHandling(editText)
    }
    
    isMonitoring = false
    textInputView = null
    contentListener = null
    originalActionModeCallback = null
    customActionModeCallback = null
  }
  
  private fun setupPasteHandling(editText: EditText) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      contentListener = createContentListener()
      ViewCompat.setOnReceiveContentListener(
        editText,
        arrayOf("image/*", "text/plain"),
        contentListener!!
      )
    }
    
    enhanceOnTextContextMenuItem(editText)
  }
  
  private fun cleanupPasteHandling(editText: EditText) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && contentListener != null) {
      ViewCompat.setOnReceiveContentListener(editText, null, null)
    }
    
    if (customActionModeCallback != null) {
      editText.customSelectionActionModeCallback = originalActionModeCallback
    }
  }
  
  private fun createContentListener(): OnReceiveContentListener {
    return OnReceiveContentListener { view, payload ->
      val clip = payload.clip
      val itemCount = clip.itemCount
      
      if (itemCount == 0) {
        return@OnReceiveContentListener payload
      }
      
      val imageUris = mutableListOf<Uri>()
      val gifUris = mutableListOf<Uri>()
      var textContent: String? = null
      
      for (i in 0 until itemCount) {
        val item = clip.getItemAt(i)
        
        val uri = item.uri
        if (uri != null) {
          val mimeType = context.contentResolver.getType(uri)
          if (mimeType != null && mimeType.startsWith("image/")) {
            if (mimeType == "image/gif") {
              gifUris.add(uri)
            } else {
              imageUris.add(uri)
            }
          }
        }
        
        val text = item.text
        if (!text.isNullOrEmpty() && textContent == null) {
          textContent = text.toString()
        }
      }
      
      if (gifUris.isNotEmpty() || imageUris.isNotEmpty()) {
        processMultipleImagePaste(imageUris, gifUris)
        return@OnReceiveContentListener null
      }
      
      if (textContent != null) {
        handleTextPaste(textContent)
        return@OnReceiveContentListener payload
      }
      
      handleUnsupportedPaste()
      return@OnReceiveContentListener payload
    }
  }
  
  private fun enhanceOnTextContextMenuItem(editText: EditText) {
    try {
      originalActionModeCallback = editText.customSelectionActionModeCallback
      
      customActionModeCallback = object : ActionMode.Callback {
        override fun onCreateActionMode(mode: ActionMode?, menu: android.view.Menu?): Boolean {
          return originalActionModeCallback?.onCreateActionMode(mode, menu) ?: true
        }
        
        override fun onPrepareActionMode(mode: ActionMode?, menu: android.view.Menu?): Boolean {
          return originalActionModeCallback?.onPrepareActionMode(mode, menu) ?: false
        }
        
        override fun onActionItemClicked(mode: ActionMode?, item: android.view.MenuItem?): Boolean {
          if (item?.itemId == android.R.id.paste) {
            val clipboard = editText.context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
            val clipData = clipboard.primaryClip
            
            if (clipData != null && clipData.itemCount > 0) {
              val imageUris = mutableListOf<Uri>()
              val gifUris = mutableListOf<Uri>()
              var textContent: String? = null
              
              for (i in 0 until clipData.itemCount) {
                val clipItem = clipData.getItemAt(i)
                val uri = clipItem.uri
                
                if (uri != null) {
                  val mimeType = editText.context.contentResolver.getType(uri)
                  if (mimeType != null && mimeType.startsWith("image/")) {
                    if (mimeType == "image/gif") {
                      gifUris.add(uri)
                    } else {
                      imageUris.add(uri)
                    }
                  }
                }
                
                if (textContent == null) {
                  val text = clipItem.text
                  if (!text.isNullOrEmpty()) {
                    textContent = text.toString()
                  }
                }
              }
              
              if (gifUris.isNotEmpty() || imageUris.isNotEmpty()) {
                processMultipleImagePaste(imageUris, gifUris)
                mode?.finish()
                return true
              }
              
              if (textContent != null) {
                var handled = false
                
                if (originalActionModeCallback != null) {
                  handled = originalActionModeCallback!!.onActionItemClicked(mode, item)
                }
                
                if (!handled && item != null) {
                  handled = editText.onTextContextMenuItem(item.itemId)
                }
                
                if (handled) {
                  handleTextPaste(textContent)
                }
                mode?.finish()
                return handled
              }
            }
          }
          
          return originalActionModeCallback?.onActionItemClicked(mode, item) ?: false
        }
        
        override fun onDestroyActionMode(mode: ActionMode?) {
          originalActionModeCallback?.onDestroyActionMode(mode)
        }
      }
      
      editText.customSelectionActionModeCallback = customActionModeCallback
      
    } catch (e: Exception) {
      // Fallback if ActionMode.Callback approach fails
    }
  }
  
  private fun findTextInputInView(view: View?): View? {
    if (view == null) return null
    
    val className = view.javaClass.simpleName
    if (className.contains("ReactTextInput") || 
        className.contains("EditText") ||
        view is EditText) {
      return view
    }
    
    if (view is ViewGroup) {
      for (i in 0 until view.childCount) {
        val child = view.getChildAt(i)
        val found = findTextInputInView(child)
        if (found != null) {
          return found
        }
      }
    }
    
    return null
  }
  
  internal fun processMultipleImagePaste(imageUris: List<Uri>, gifUris: List<Uri> = emptyList()) {
    try {
      val filePaths = mutableListOf<String>()
      
      for (gifUri in gifUris) {
        val gifPath = copyGifFile(gifUri)
        if (gifPath != null) {
          filePaths.add(gifPath)
        }
      }
      
      for (uri in imageUris) {
        val inputStream = context.contentResolver.openInputStream(uri) ?: continue
        
        inputStream.use { stream ->
          val bitmap = BitmapFactory.decodeStream(stream)
          
          if (bitmap == null) {
            return@use
          }
          
          val cacheDir = context.cacheDir
          val fileName = "${System.currentTimeMillis()}_${filePaths.size}.jpg"
          val file = File(cacheDir, fileName)
          
          FileOutputStream(file).use { outputStream ->
            bitmap.compress(Bitmap.CompressFormat.JPEG, 80, outputStream)
            outputStream.flush()
          }
          
          val filePath = "file://${file.absolutePath}"
          filePaths.add(filePath)
        }
      }
      
      if (filePaths.isEmpty()) {
        handleUnsupportedPaste()
        return
      }
      
      onPaste(mapOf(
        "type" to "images",
        "uris" to filePaths
      ))
    } catch (e: Exception) {
      handleUnsupportedPaste()
    }
  }
  
  private fun copyGifFile(uri: Uri): String? {
    return try {
      val inputStream = context.contentResolver.openInputStream(uri) ?: return null
      
      val cacheDir = context.cacheDir
      val fileName = "${System.currentTimeMillis()}_${System.nanoTime()}.gif"
      val file = File(cacheDir, fileName)
      
      inputStream.use { input ->
        FileOutputStream(file).use { output ->
          input.copyTo(output)
          output.flush()
        }
      }
      
      "file://${file.absolutePath}"
    } catch (e: Exception) {
      null
    }
  }
  
  private fun handleTextPaste(text: String) {
    onPaste(mapOf(
      "type" to "text",
      "value" to text
    ))
  }
  
  private fun handleUnsupportedPaste() {
    onPaste(mapOf(
      "type" to "unsupported"
    ))
  }
}
