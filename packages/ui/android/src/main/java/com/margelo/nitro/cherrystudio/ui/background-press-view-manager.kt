package com.margelo.nitro.cherrystudio.ui

import android.widget.FrameLayout
import com.facebook.react.uimanager.ReactStylesDiffMap
import com.facebook.react.uimanager.StateWrapper
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.ViewGroupManager
import com.margelo.nitro.R.id.associated_hybrid_view_tag
import com.margelo.nitro.cherrystudio.ui.views.HybridCherryBackgroundPressViewStateUpdater

class CherryBackgroundPressViewManager : ViewGroupManager<FrameLayout>() {
    override fun getName(): String = "CherryBackgroundPressView"

    override fun createViewInstance(reactContext: ThemedReactContext): FrameLayout {
        val hybrid = HybridCherryBackgroundPressView(reactContext)
        return (hybrid.view as FrameLayout).also { it.setTag(associated_hybrid_view_tag, hybrid) }
    }

    override fun updateState(view: FrameLayout, props: ReactStylesDiffMap, stateWrapper: StateWrapper): Any? {
        val hybrid = view.getTag(associated_hybrid_view_tag) as? HybridCherryBackgroundPressView
            ?: error("Couldn't find HybridCherryBackgroundPressView for $view")
        hybrid.beforeUpdate()
        HybridCherryBackgroundPressViewStateUpdater.updateViewProps(hybrid, stateWrapper)
        hybrid.afterUpdate()
        return super.updateState(view, props, stateWrapper)
    }

    override fun needsCustomLayoutForChildren(): Boolean = false

    override fun onDropViewInstance(view: FrameLayout) {
        (view.getTag(associated_hybrid_view_tag) as? HybridCherryBackgroundPressView)?.onDropView()
        super.onDropViewInstance(view)
    }
}
