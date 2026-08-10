package com.margelo.nitro.cherrystudio.ui

import android.view.View
import android.widget.FrameLayout
import com.facebook.react.uimanager.ReactStylesDiffMap
import com.facebook.react.uimanager.StateWrapper
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.ViewGroupManager
import com.margelo.nitro.R.id.associated_hybrid_view_tag
import com.margelo.nitro.cherrystudio.ui.views.HybridCherryMenuViewStateUpdater

class CherryMenuViewManager : ViewGroupManager<FrameLayout>() {
    override fun getName(): String = "CherryMenuView"

    override fun createViewInstance(reactContext: ThemedReactContext): FrameLayout {
        val hybridView = HybridCherryMenuView(reactContext)
        val view = hybridView.view as FrameLayout
        view.setTag(associated_hybrid_view_tag, hybridView)
        return view
    }

    override fun updateState(
        view: FrameLayout,
        props: ReactStylesDiffMap,
        stateWrapper: StateWrapper,
    ): Any? {
        val hybridView = view.getTag(associated_hybrid_view_tag) as? HybridCherryMenuView
            ?: error("Couldn't find HybridCherryMenuView for $view")

        hybridView.beforeUpdate()
        HybridCherryMenuViewStateUpdater.updateViewProps(hybridView, stateWrapper)
        hybridView.afterUpdate()

        return super.updateState(view, props, stateWrapper)
    }

    override fun addView(parent: FrameLayout, child: View, index: Int) {
        parent.addView(child, index)
    }

    override fun removeViewAt(parent: FrameLayout, index: Int) {
        parent.removeViewAt(index)
    }

    override fun getChildCount(parent: FrameLayout): Int = parent.childCount

    override fun getChildAt(parent: FrameLayout, index: Int): View? = parent.getChildAt(index)

    override fun needsCustomLayoutForChildren(): Boolean = false
}
