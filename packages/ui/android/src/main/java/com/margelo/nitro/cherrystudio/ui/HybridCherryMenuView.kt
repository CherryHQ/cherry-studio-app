package com.margelo.nitro.cherrystudio.ui

import android.content.Context
import android.view.GestureDetector
import android.view.Menu
import android.view.MotionEvent
import android.view.View
import android.widget.FrameLayout
import android.widget.PopupMenu
import androidx.annotation.Keep
import com.facebook.proguard.annotations.DoNotStrip
import com.facebook.react.uimanager.ThemedReactContext

private class MenuFrameLayout(context: Context) : FrameLayout(context) {
    var onLongPress: (() -> Unit)? = null
    var onTap: (() -> Unit)? = null

    private val gestureDetector = GestureDetector(
        context,
        object : GestureDetector.SimpleOnGestureListener() {
            override fun onDown(event: MotionEvent): Boolean = true

            override fun onSingleTapUp(event: MotionEvent): Boolean {
                val handler = onTap ?: return false
                handler()
                return true
            }

            override fun onLongPress(event: MotionEvent) {
                onLongPress?.invoke()
            }
        },
    )

    override fun dispatchTouchEvent(event: MotionEvent): Boolean {
        gestureDetector.onTouchEvent(event)
        return super.dispatchTouchEvent(event)
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
            val menuItem = popup.menu.add(Menu.NONE, index, Menu.NONE, item.label)
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
}
