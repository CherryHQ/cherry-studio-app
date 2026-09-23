package com.margelo.nitro.cherrystudio.ui

import android.content.Context
import android.view.GestureDetector
import android.view.MotionEvent
import android.view.View
import android.view.ViewParent
import android.widget.FrameLayout
import androidx.annotation.Keep
import com.facebook.proguard.annotations.DoNotStrip
import com.facebook.react.uimanager.ThemedReactContext

/**
 * Observes platform taps without intercepting a descendant's native or RN gesture. This view is
 * the only owner of the press decision: scrolling, nested areas, exclusions, and extra pointers
 * cancel it on the UI thread before a completed tap can be reported.
 */
internal class BackgroundPressView(context: Context) : FrameLayout(context) {
    var mode = BackgroundPressMode.BACKGROUND
        set(value) {
            if (field == value) return
            field = value
            cancelled = true
        }
    var recognitionEnabled = false
        set(value) {
            field = value
            if (!value) cancelled = true
        }
    var onBackgroundPress: () -> Unit = {}
    private var cancelled = true

    // GestureDetector reads ViewConfiguration: movement cancellation is sticky, long holds
    // never become taps, and the system's touch slop/long-press preference owns recognition.
    private val detector = GestureDetector(context, object : GestureDetector.SimpleOnGestureListener() {
        override fun onDown(event: MotionEvent): Boolean = true

        override fun onSingleTapUp(event: MotionEvent): Boolean {
            if (cancelled || !recognitionEnabled) return false
            cancelled = true
            onBackgroundPress()
            return true
        }
    }).apply { setOnDoubleTapListener(null) }

    override fun dispatchTouchEvent(event: MotionEvent): Boolean {
        if (event.actionMasked == MotionEvent.ACTION_DOWN) {
            cancelAncestorPress()
            cancelled = !recognitionEnabled || mode != BackgroundPressMode.BACKGROUND
        }
        if (event.actionMasked == MotionEvent.ACTION_POINTER_DOWN ||
            event.actionMasked == MotionEvent.ACTION_CANCEL
        ) {
            cancelled = true
        }

        // Descendant exclusions and ScrollView interception cancel synchronously before a
        // completed tap is delivered. A ScrollView also requests disallow-intercept when a touch
        // stops its fling. No responder is acquired and no child is sent CANCEL.
        val handled = super.dispatchTouchEvent(event)
        if (mode == BackgroundPressMode.BACKGROUND) detector.onTouchEvent(event)
        return handled
    }

    override fun onTouchEvent(event: MotionEvent): Boolean =
        (recognitionEnabled && mode == BackgroundPressMode.BACKGROUND) || super.onTouchEvent(event)

    override fun requestDisallowInterceptTouchEvent(disallowIntercept: Boolean) {
        if (disallowIntercept) cancelled = true
        super.requestDisallowInterceptTouchEvent(disallowIntercept)
    }

    private fun cancelAncestorPress() {
        var ancestor: ViewParent? = parent
        while (ancestor != null) {
            if (ancestor is BackgroundPressView && ancestor.mode == BackgroundPressMode.BACKGROUND) {
                ancestor.cancelled = true
                return
            }
            ancestor = ancestor.parent
        }
    }

    override fun onDetachedFromWindow() {
        cancelled = true
        super.onDetachedFromWindow()
    }

    override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
        // Yoga also owns child measurement. FrameLayout would re-measure flattened children such
        // as Text at this view's full size, leaving their content laid out wider than their frame.
        setMeasuredDimension(
            View.MeasureSpec.getSize(widthMeasureSpec),
            View.MeasureSpec.getSize(heightMeasureSpec),
        )
    }

    override fun onLayout(changed: Boolean, left: Int, top: Int, right: Int, bottom: Int) {
        // Yoga owns child layout; FrameLayout must not overwrite it.
    }
}

@DoNotStrip
@Keep
class HybridCherryBackgroundPressView(reactContext: ThemedReactContext? = null) :
    HybridCherryBackgroundPressViewSpec() {
    private val container = BackgroundPressView(reactContext ?: error("ThemedReactContext is required"))
    override val view: View get() = container
    override var mode: BackgroundPressMode
        get() = container.mode
        set(value) { container.mode = value }
    override var enabled: Boolean
        get() = container.recognitionEnabled
        set(value) { container.recognitionEnabled = value }
    override var onBackgroundPress: () -> Unit
        get() = container.onBackgroundPress
        set(value) { container.onBackgroundPress = value }
}
