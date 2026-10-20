package com.margelo.nitro.cherrystudio.ui

import android.view.KeyEvent
import android.view.View
import android.view.Window
import com.facebook.react.bridge.Arguments
import com.facebook.react.uimanager.SimpleViewManager
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.UIManagerHelper
import com.facebook.react.uimanager.ViewManagerDelegate
import com.facebook.react.uimanager.events.Event
import com.facebook.react.viewmanagers.CherryMenuEscapeViewManagerDelegate
import com.facebook.react.viewmanagers.CherryMenuEscapeViewManagerInterface

/** Intercepts Escape at the focused activity without moving focus into the menu window. */
class MenuEscapeView(private val reactContext: ThemedReactContext) : View(reactContext) {
    private var window: Window? = null
    private var escapeCallback: MenuEscapeWindowCallback? = null

    override fun onAttachedToWindow() {
        super.onAttachedToWindow()
        val activityWindow = reactContext.currentActivity?.window ?: return
        val previous = activityWindow.callback ?: return
        val callback = MenuEscapeWindowCallback(previous, ::emitEscape)
        window = activityWindow
        escapeCallback = callback
        activityWindow.callback = callback
    }

    override fun onDetachedFromWindow() {
        release()
        super.onDetachedFromWindow()
    }

    fun release() {
        val callback = escapeCallback ?: return
        callback.onEscape = null
        // A newer menu may still own the window. Leave its callback in place and
        // skip retired listeners when that menu eventually restores the chain.
        if (window?.callback === callback) {
            var previous = callback.previous
            while (previous is MenuEscapeWindowCallback && previous.onEscape == null) {
                previous = previous.previous
            }
            window?.callback = previous
        }
        escapeCallback = null
        window = null
    }

    private fun emitEscape() {
        UIManagerHelper.getEventDispatcherForReactTag(reactContext, id)?.dispatchEvent(
            MenuEscapeEvent(UIManagerHelper.getSurfaceId(reactContext), id),
        )
    }
}

private class MenuEscapeWindowCallback(
    val previous: Window.Callback,
    var onEscape: (() -> Unit)?,
) : Window.Callback by previous {
    private var isEscapePressed = false

    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        val close = onEscape
        if (event.keyCode != KeyEvent.KEYCODE_ESCAPE || close == null) {
            return previous.dispatchKeyEvent(event)
        }

        // Consume both halves so the focused editor cannot also handle Escape.
        // Repeated DOWN events and a cancelled UP must not dismiss another surface.
        when (event.action) {
            KeyEvent.ACTION_DOWN -> if (event.repeatCount == 0) isEscapePressed = true
            KeyEvent.ACTION_UP -> {
                val shouldClose = isEscapePressed && !event.isCanceled
                isEscapePressed = false
                if (shouldClose) close()
            }
        }
        return true
    }
}

private class MenuEscapeEvent(surfaceId: Int, viewId: Int) :
    Event<MenuEscapeEvent>(surfaceId, viewId) {
    override fun getEventName(): String = "topEscape"
    override fun canCoalesce(): Boolean = false
    override fun getEventData() = Arguments.createMap().apply { putString("key", "Escape") }
}

class CherryMenuEscapeViewManager :
    SimpleViewManager<MenuEscapeView>(),
    CherryMenuEscapeViewManagerInterface<MenuEscapeView> {
    private val delegate =
        CherryMenuEscapeViewManagerDelegate<MenuEscapeView, CherryMenuEscapeViewManager>(this)

    override fun getDelegate(): ViewManagerDelegate<MenuEscapeView> = delegate
    override fun getName(): String = "CherryMenuEscapeView"
    override fun createViewInstance(context: ThemedReactContext): MenuEscapeView =
        MenuEscapeView(context)

    override fun getExportedCustomDirectEventTypeConstants(): Map<String, Any> =
        mapOf("topEscape" to mapOf("registrationName" to "onEscape"))

    override fun onDropViewInstance(view: MenuEscapeView) {
        view.release()
        super.onDropViewInstance(view)
    }
}
