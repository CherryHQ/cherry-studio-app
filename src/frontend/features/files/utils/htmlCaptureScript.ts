import {
  HTML_CONVERSION_MAX_EDGE,
  HTML_CONVERSION_MAX_PAGES,
  HTML_CONVERSION_MAX_PIXELS,
  type HtmlConversionFormat,
} from '@/shared/contracts/documentExport';

import { HTML_CAPTURE_HEIGHT, HTML_CAPTURE_WIDTH, type HtmlCapturePage } from './htmlCapturePlan';

/** Runs only in the disposable conversion WebView, never in the user's interactive preview. */
export function htmlCaptureSetupScript(id: string, format: HtmlConversionFormat, density: number) {
  return `(async function(){
    if(window.__cherryCapture) return;
    var send=function(message){window.ReactNativeWebView.postMessage(JSON.stringify(Object.assign({id:${JSON.stringify(id)}},message)));};
    window.__cherryCapture={send:send};
    try{
      var viewport=document.querySelector('meta[name="viewport"]');
      if(!viewport){viewport=document.createElement('meta');viewport.name='viewport';document.head.appendChild(viewport);}
      viewport.content='width=${HTML_CAPTURE_WIDTH},initial-scale=${1 / density},minimum-scale=${1 / density},maximum-scale=${1 / density},user-scalable=no';
      var frame=function(){return new Promise(requestAnimationFrame);};
      var set=function(node,values){Object.keys(values).forEach(function(key){node.style.setProperty(key,values[key],'important');});};
      window.__cherryCapture.set=set;
      var freeze=document.createElement('style');
      freeze.textContent='*,*::before,*::after{transition:none!important;scroll-behavior:auto!important;caret-color:transparent!important}';
      document.head.appendChild(freeze);
      Array.from(document.images).forEach(function(image){image.loading='eager';});
      await document.fonts.ready;
      await Promise.all(Array.from(document.images).map(function(image){return image.decode();}));
      Array.from(document.querySelectorAll('video,audio')).forEach(function(media){media.pause();});
      document.getAnimations().forEach(function(animation){
        try{if(Number.isFinite(animation.effect.getComputedTiming().endTime))animation.finish();else animation.pause();}
        catch(error){animation.pause();}
      });
      set(document.documentElement,{width:'${HTML_CAPTURE_WIDTH}px',height:'${HTML_CAPTURE_HEIGHT}px','min-height':'0',overflow:'visible'});
      set(document.body,{'min-height':'0'});
      var candidates=Array.from(document.querySelectorAll('[data-slide],.slide'));
      var slides=candidates.filter(function(node){return !node.parentElement.closest('[data-slide],.slide');});
      if(slides.length>${HTML_CONVERSION_MAX_PAGES}){send({phase:'limit'});return;}
      if(slides.length){
        // Measure every slide in its authored layout before changing any shared ancestor.
        var slideLayouts=slides.map(function(slide){
          var display=getComputedStyle(slide).display;
          var inlineDisplay=slide.style.getPropertyValue('display');
          var displayPriority=slide.style.getPropertyPriority('display');
          if(display==='none') set(slide,{display:'block'});
          var style=getComputedStyle(slide);
          var layout={slide:slide,display:display==='none'?'block':display,width:style.width,height:style.height};
          if(display==='none'){
            if(inlineDisplay) slide.style.setProperty('display',inlineDisplay,displayPriority);
            else slide.style.removeProperty('display');
          }
          return layout;
        });
        slideLayouts.forEach(function(layout){
          var slide=layout.slide;
          for(var parent=slide.parentElement;parent&&parent!==document.documentElement;parent=parent.parentElement){
            set(parent,{display:'block',position:'static',transform:'none',height:'auto','max-height':'none',overflow:'visible'});
          }
          set(slide,{display:layout.display,width:layout.width,height:layout.height,position:'relative',top:'auto',left:'auto',right:'auto',bottom:'auto',transform:'none',opacity:'1',visibility:'visible','flex-shrink':'0'});
        });
      }
      await frame();
      await document.fonts.ready;
      var measure=function(){
        var body=document.body,root=document.documentElement;
        return {width:Math.ceil(Math.max(${HTML_CAPTURE_WIDTH},body.scrollWidth,root.scrollWidth)),height:Math.ceil(Math.max(body.scrollHeight,body.getBoundingClientRect().bottom,${HTML_CAPTURE_HEIGHT}))};
      };
      var previous='',stable=0,bounds;
      for(var i=0;i<120;i++){
        await frame();bounds=measure();var key=JSON.stringify(bounds);
        stable=key===previous?stable+1:0;previous=key;if(stable>=3)break;
      }
      if(stable<3)throw new Error('Unstable layout');
      if(!Number.isSafeInteger(bounds.width)||!Number.isSafeInteger(bounds.height)||bounds.width>${HTML_CONVERSION_MAX_EDGE}){send({phase:'limit'});return;}
      // Pin the authored layout before resizing the native capture surface.
      var bodyStyle=getComputedStyle(document.body);
      set(document.body,{width:bodyStyle.width,height:bodyStyle.height});
      var pages;
      if(${JSON.stringify(format)}==='image') {
        if(bounds.height>${HTML_CONVERSION_MAX_EDGE}||bounds.width*bounds.height>${HTML_CONVERSION_MAX_PIXELS}){send({phase:'limit'});return;}
        pages=[{x:0,y:0,width:bounds.width,height:bounds.height}];
      }
      else if(slides.length) pages=slides.map(function(slide){var rect=slide.getBoundingClientRect();return {x:Math.max(0,Math.floor(rect.left)),y:Math.max(0,Math.floor(rect.top)),width:Math.ceil(rect.width),height:Math.ceil(rect.height)};});
      else {
        var height=Math.round(bounds.width*9/16);
        var count=Math.ceil(bounds.height/height);
        if(count>${HTML_CONVERSION_MAX_PAGES}){send({phase:'limit'});return;}
        pages=Array.from({length:count},function(_,index){return {x:0,y:index*height,width:bounds.width,height:height};});
      }
      window.__cherryCapture.bounds=bounds;
      window.__cherryCapture.bodyWidth=document.body.scrollWidth;
      window.__cherryCapture.bodyHeight=document.body.scrollHeight;
      send({phase:'measured',pages:pages});
    }catch(error){send({phase:'error'});}
  })();true;`;
}

export function htmlCapturePageScript(
  id: string,
  index: number,
  page: HtmlCapturePage,
  density: number,
) {
  return `(async function(){try{
    var capture=window.__cherryCapture;if(!capture)return;
    document.querySelector('meta[name="viewport"]').content='width=${page.width},initial-scale=${1 / density},minimum-scale=${1 / density},maximum-scale=${1 / density},user-scalable=no';
    window.scrollTo(0,0);
    capture.set(document.documentElement,{'transform-origin':'0 0',transform:'translate(-${page.x}px,-${page.y}px)'});
    for(var frame=0;frame<4;frame++)await new Promise(requestAnimationFrame);
    // Detect unsupported viewport reflow instead of quietly exporting clipped content.
    var body=document.body;
    if(Math.abs(window.innerWidth-${page.width})>2 || Math.abs(window.innerHeight-${page.height})>2 ||
       Math.abs(body.scrollWidth-capture.bodyWidth)>2 ||
       Math.abs(body.scrollHeight-capture.bodyHeight)>2)throw new Error('Capture viewport mismatch');
    capture.send({phase:'ready',index:${index},id:${JSON.stringify(id)},density:${density}});
  }catch(error){window.__cherryCapture.send({phase:'error'});}})();true;`;
}
