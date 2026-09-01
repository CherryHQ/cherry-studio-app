// Native menu behavior adapted from react-native-nitro-contextmenu and
// react-native-nitro-menu. See packages/ui/third-party-notices.md.
package com.margelo.nitro.cherrystudio.ui

import android.content.Context
import android.graphics.drawable.Drawable
import android.os.Build
import android.text.SpannableString
import android.text.Spanned
import android.text.style.ForegroundColorSpan
import android.util.TypedValue
import android.view.GestureDetector
import android.view.Menu
import android.view.MotionEvent
import android.view.View
import android.view.ViewConfiguration
import android.widget.FrameLayout
import android.widget.PopupMenu
import androidx.annotation.Keep
import com.facebook.proguard.annotations.DoNotStrip
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.events.NativeGestureUtil

private class MenuFrameLayout(context: Context) : FrameLayout(context) {
    var onTap: (() -> Unit)? = null
    private var isMenuGestureActive = false
    private var isNativeGestureActive = false

    // Tap triggers are button behavior the menu may own outright. Long press competes with
    // scrolling and pan gestures, so its recognition lives in the shared gesture arena on the
    // JavaScript side; this view only presents through showMenu().
    private val gestureDetector = GestureDetector(
        context,
        object : GestureDetector.SimpleOnGestureListener() {
            override fun onDown(event: MotionEvent): Boolean = true

            override fun onSingleTapUp(event: MotionEvent): Boolean {
                val handler = onTap ?: return false
                activateMenu(event, handler)
                return true
            }
        },
    )

    override fun dispatchTouchEvent(event: MotionEvent): Boolean {
        if (onTap == null) {
            return super.dispatchTouchEvent(event)
        }

        if (event.actionMasked == MotionEvent.ACTION_DOWN) {
            isMenuGestureActive = false
            isNativeGestureActive = false
            // RootView sees ACTION_UP before descendants do. Claim tap-trigger gestures on
            // DOWN so a wrapped React Pressable cannot release before the menu takes over.
            startNativeGesture(event)
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
                containerView.onTap = ::showPopupMenu
            }
            // A long-press menu never recognizes its own trigger on Android: the shared gesture
            // arena arbitrates the long press against scrolling and pans, then calls showMenu().
            NativeMenuTrigger.LONGPRESS -> {
                containerView.onTap = null
            }
        }
    }

    override fun getLongPressMinDuration(): Double =
        ViewConfiguration.getLongPressTimeout().toDouble()

    override fun getLongPressMaxDistance(): Double {
        val touchSlop = ViewConfiguration.get(containerView.context).scaledTouchSlop
        val density = containerView.resources.displayMetrics.density
        return (touchSlop / density).toDouble()
    }

    override fun showMenu() {
        // Hybrid methods arrive on the JS thread; PopupMenu must be shown from the UI thread.
        containerView.post(::showPopupMenu)
    }

    private fun showPopupMenu() {
        if (items.isEmpty()) return

        currentPopup?.dismiss()
        val popup = PopupMenu(containerView.context, containerView)
        val itemIds = mutableMapOf<Int, String>()
        var hasIcon = false

        items.forEachIndexed { index, item ->
            val title =
                if (item.destructive && !item.disabled) destructiveTitle(item.label) else item.label
            val menuItem = popup.menu.add(Menu.NONE, index, Menu.NONE, title)
            menuItem.isEnabled = !item.disabled
            if (item.checked != NativeMenuCheckedState.NONE) {
                menuItem.isCheckable = true
                menuItem.isChecked = item.checked == NativeMenuCheckedState.ON
            }
            resolveIcon(item.icon)?.let { icon ->
                menuItem.icon = icon
                hasIcon = true
            }
            itemIds[index] = item.id
        }

        // PopupMenu hides icons unless asked; the opt-in only exists from Q on,
        // and older devices degrade to a text-only menu rather than crashing.
        if (hasIcon && Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            popup.setForceShowIcon(true)
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

    /** Resolves the contract's semantic icon token to this platform's artwork. */
    private fun resolveIcon(icon: NativeMenuIcon): Drawable? {
        val resourceId =
            when (icon) {
                NativeMenuIcon.NONE -> return null
                NativeMenuIcon.BRANCH -> R.drawable.cherry_menu_icon_branch
            }

        return containerView.context.getDrawable(resourceId)?.mutate()?.apply {
            setTint(resolveColor(android.R.attr.textColorPrimary, android.R.color.black))
        }
    }

    private fun destructiveTitle(label: String): CharSequence =
        SpannableString(label).apply {
            setSpan(
                ForegroundColorSpan(
                    resolveColor(android.R.attr.colorError, android.R.color.holo_red_dark),
                ),
                0,
                length,
                Spanned.SPAN_EXCLUSIVE_EXCLUSIVE,
            )
        }

    private fun resolveColor(themeAttribute: Int, fallbackColor: Int): Int {
        val color = TypedValue()
        val context = containerView.context
        if (!context.theme.resolveAttribute(themeAttribute, color, true)) {
            return context.getColor(fallbackColor)
        }

        return if (color.resourceId == 0) color.data else context.getColor(color.resourceId)
    }
}
