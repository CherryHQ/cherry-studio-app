// Native menu behavior adapted from react-native-nitro-contextmenu and
// react-native-nitro-menu. See packages/ui/third-party-notices.md.
package com.margelo.nitro.cherrystudio.ui

import android.content.Context
import android.text.SpannableString
import android.text.Spanned
import android.text.style.ForegroundColorSpan
import android.util.TypedValue
import android.view.GestureDetector
import android.view.Menu
import android.view.MotionEvent
import android.view.View
import android.widget.FrameLayout
import android.widget.PopupMenu
import androidx.annotation.Keep
import com.facebook.proguard.annotations.DoNotStrip
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.events.NativeGestureUtil

private class MenuFrameLayout(context: Context) : FrameLayout(context) {
    var onLongPress: (() -> Unit)? = null
    var onTap: (() -> Unit)? = null
    private var isMenuGestureActive = false
    private var isNativeGestureActive = false

    private val gestureDetector = GestureDetector(
        context,
        object : GestureDetector.SimpleOnGestureListener() {
            override fun onDown(event: MotionEvent): Boolean = true

            override fun onSingleTapUp(event: MotionEvent): Boolean {
                val handler = onTap ?: return false
                activateMenu(event, handler)
                return true
            }

            override fun onLongPress(event: MotionEvent) {
                onLongPress?.let { activateMenu(event, it) }
            }
        },
    )

    override fun dispatchTouchEvent(event: MotionEvent): Boolean {
        if (event.actionMasked == MotionEvent.ACTION_DOWN) {
            isMenuGestureActive = false
            isNativeGestureActive = false
            if (onTap != null) {
                // RootView sees ACTION_UP before descendants do. Claim tap-trigger gestures on
                // DOWN so a wrapped React Pressable cannot release before the menu takes over.
                startNativeGesture(event)
            }
        }

        gestureDetector.onTouchEvent(event)

        if (isMenuGestureActive) {
            if (
                event.actionMasked == MotionEvent.ACTION_UP ||
                    event.actionMasked == MotionEvent.ACTION_CANCEL
            ) {
                isMenuGestureActive = false
                endNativeGesture(event)
            }
            return true
        }

        val handled = super.dispatchTouchEvent(event)
        if (
            event.actionMasked == MotionEvent.ACTION_UP ||
                event.actionMasked == MotionEvent.ACTION_CANCEL
        ) {
            endNativeGesture(event)
        }
        return handled
    }

    private fun activateMenu(event: MotionEvent, handler: () -> Unit) {
        isMenuGestureActive = true
        // Long-press claims RN's root responder here; tap already claimed it on DOWN. Both still
        // cancel the native child that received the gesture stream.
        startNativeGesture(event)
        MotionEvent.obtain(event).also { cancelEvent ->
            cancelEvent.action = MotionEvent.ACTION_CANCEL
            super.dispatchTouchEvent(cancelEvent)
            cancelEvent.recycle()
        }
        handler()
    }

    private fun startNativeGesture(event: MotionEvent) {
        if (isNativeGestureActive) return

        isNativeGestureActive = true
        NativeGestureUtil.notifyNativeGestureStarted(this, event)
    }

    private fun endNativeGesture(event: MotionEvent) {
        if (!isNativeGestureActive) return

        isNativeGestureActive = false
        NativeGestureUtil.notifyNativeGestureEnded(this, event)
    }

    override fun onLayout(changed: Boolean, left: Int, top: Int, right: Int, bottom: Int) {
        // React Native's UIManager lays out children when the view manager does not opt into
        // custom child layout. Letting FrameLayout run here would overwrite those Yoga positions.
    }
}

@DoNotStrip
@Keep
class HybridCherryMenuView(
    reactContext: ThemedReactContext? = null,
) : HybridCherryMenuViewSpec() {
    private val containerView = MenuFrameLayout(
        reactContext ?: error("ThemedReactContext is required"),
    )

    override val view: View
        get() = containerView

    override var items: Array<NativeMenuItem> = emptyArray()
    override var onAction: (id: String) -> Unit = {}
    override var trigger: NativeMenuTrigger = NativeMenuTrigger.TAP
        set(value) {
            field = value
            updateTrigger()
        }

    private var currentPopup: PopupMenu? = null

    init {
        updateTrigger()
    }

    private fun updateTrigger() {
        when (trigger) {
            NativeMenuTrigger.TAP -> {
                containerView.onLongPress = null
                containerView.onTap = ::showPopupMenu
            }
            NativeMenuTrigger.LONGPRESS -> {
                containerView.onTap = null
                containerView.onLongPress = ::showPopupMenu
            }
        }
    }

    private fun showPopupMenu() {
        if (items.isEmpty()) return

        currentPopup?.dismiss()
        val popup = PopupMenu(containerView.context, containerView)
        val itemIds = mutableMapOf<Int, String>()

        items.forEachIndexed { index, item ->
            val title =
                if (item.destructive && !item.disabled) destructiveTitle(item.label) else item.label
            val menuItem = popup.menu.add(Menu.NONE, index, Menu.NONE, title)
            menuItem.isEnabled = !item.disabled
            if (item.checked != NativeMenuCheckedState.NONE) {
                menuItem.isCheckable = true
                menuItem.isChecked = item.checked == NativeMenuCheckedState.ON
            }
            itemIds[index] = item.id
        }

        popup.setOnMenuItemClickListener { menuItem ->
            itemIds[menuItem.itemId]?.let(onAction)
            true
        }
        popup.setOnDismissListener {
            if (currentPopup === popup) {
                currentPopup = null
            }
        }

        currentPopup = popup
        popup.show()
    }

    private fun destructiveTitle(label: String): CharSequence =
        SpannableString(label).apply {
            setSpan(
                ForegroundColorSpan(resolveDestructiveColor()),
                0,
                length,
                Spanned.SPAN_EXCLUSIVE_EXCLUSIVE,
            )
        }

    private fun resolveDestructiveColor(): Int {
        val color = TypedValue()
        val context = containerView.context
        if (!context.theme.resolveAttribute(android.R.attr.colorError, color, true)) {
            return context.getColor(android.R.color.holo_red_dark)
        }

        return if (color.resourceId == 0) color.data else context.getColor(color.resourceId)
    }
}
